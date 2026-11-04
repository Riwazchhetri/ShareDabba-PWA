import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import multer from "multer";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { env } from "./config.js";
import { checkDatabase, pool } from "./db.js";
import { v2 as cloudinary } from "cloudinary";

const app = express();
const webDirectory = path.resolve(process.cwd(), "dist/web");
const webIndex = path.join(webDirectory, "index.html");
const COOKIE_NAME = "sharedabba_session";
const SESSION_TTL = 7 * 24 * 60 * 60;

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.WEB_ORIGIN.split(",").map((origin) => origin.trim()), credentials: true }));
app.use(express.json({ limit: "1mb" }));

function makeToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL })).toString("base64url");
  const signature = createHmac("sha256", env.AUTH_SECRET).update(payload).digest("base64url");
  return payload + "." + signature;
}
function readToken(token: string): string | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", env.AUTH_SECRET).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp > Math.floor(Date.now() / 1000) && typeof data.sub === "string" ? data.sub : null;
  } catch { return null; }
}
function sessionCookie(token: string, maxAge = SESSION_TTL): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
function cookieToken(req: express.Request): string | undefined {
  return req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + "="))?.slice(COOKIE_NAME.length + 1);
}
function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const userId = readToken(cookieToken(req) || "");
  if (!userId) return res.status(401).json({ error: "Please sign in to continue." });
  try {
    const result = await pool.query("SELECT id, email, display_name, role, status FROM users WHERE id = $1", [userId]);
    const user = result.rows[0];
    if (!user || user.status !== "active") return res.status(401).json({ error: "Your account is unavailable. Please contact support." });
    (req as any).user = user;
    next();
  } catch { return res.status(500).json({ error: "Could not verify your session." }); }
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "sharedabba-api", environment: env.NODE_ENV, timestamp: new Date().toISOString() }));

app.post("/api/auth/register", async (req, res) => {
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (displayName.length < 2 || displayName.length > 60) return res.status(400).json({ error: "Enter a name between 2 and 60 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Password must be 8–128 characters." });
  try {
    const result = await pool.query("INSERT INTO users (email, password_hash, display_name, role, status) VALUES ($1, $2, $3, 'creator', 'active') RETURNING id, email, display_name, role", [email, hashPassword(password), displayName]);
    res.setHeader("Set-Cookie", sessionCookie(makeToken(result.rows[0].id)));
    return res.status(201).json({ ok: true, user: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    console.error("Registration failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not create your account. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) return res.status(400).json({ error: "Enter your email and password." });
  try {
    const result = await pool.query("SELECT id, email, display_name, role, status, password_hash FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || user.status !== "active" || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: "Email or password is incorrect." });
    res.setHeader("Set-Cookie", sessionCookie(makeToken(user.id)));
    return res.json({ ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } });
  } catch (error) {
    console.error("Login failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not sign in. Please try again." });
  }
});

app.post("/api/auth/firebase", async (req, res) => {
  if (!env.FIREBASE_API_KEY) return res.status(503).json({ error: "Firebase sign-in is not configured yet." });
  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
  if (!idToken || idToken.length > 12000) return res.status(400).json({ error: "Firebase sign-in token is missing or invalid." });
  try {
    const verified = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(env.FIREBASE_API_KEY), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
    if (!verified.ok) return res.status(401).json({ error: "Firebase could not verify this sign-in. Please try again." });
    const payload = await verified.json() as { users?: Array<Record<string, unknown>> };
    const claims = payload.users?.[0];
    const email = typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!claims || claims.emailVerified !== true || typeof claims.localId !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(401).json({ error: "Your Google account email must be verified before signing in." });
    const displayName = (typeof claims.displayName === "string" && claims.displayName.trim()) || email.split("@")[0];
    let result = await pool.query("INSERT INTO users (email, password_hash, display_name, role, status) VALUES ($1, $2, $3, 'creator', 'active') ON CONFLICT (email) DO NOTHING RETURNING id, email, display_name, role, status", [email, hashPassword(randomBytes(32).toString("base64url")), displayName.slice(0, 60)]);
    let user = result.rows[0];
    if (!user) { result = await pool.query("SELECT id, email, display_name, role, status FROM users WHERE email = $1 LIMIT 1", [email]); user = result.rows[0]; }
    if (!user || user.status !== "active") return res.status(403).json({ error: "This ShareDabba account is unavailable. Contact support." });
    res.setHeader("Set-Cookie", sessionCookie(makeToken(user.id)));
    return res.json({ ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } });
  } catch (error) { console.error("Firebase sign-in failed:", error instanceof Error ? error.message : "Unknown error"); return res.status(500).json({ error: "Firebase sign-in failed. Please try again." }); }
});

app.post("/api/auth/logout", (_req, res) => { res.setHeader("Set-Cookie", sessionCookie("", 0)); res.json({ ok: true }); });
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ ok: true, user: (req as any).user }));

const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
app.post("/api/files/upload", requireAuth, uploadMiddleware.single("file"), async (req, res) => {
  if (!env.CLOUDINARY_URL) return res.status(503).json({ error: "Cloud storage is not configured." });
  if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });
  const user = (req as any).user;
  let uploaded: any;
  try {
    cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });
    const resourceType = req.file.mimetype.startsWith("video/") ? "video" : req.file.mimetype.startsWith("image/") ? "image" : "raw";
    uploaded = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: "sharedabba", resource_type: resourceType, use_filename: true, unique_filename: true, overwrite: false },
        (error, result) => error ? reject(error) : resolve(result));
      stream.end(req.file!.buffer);
    });
    const slug = randomUUID().replace(/-/g, "").slice(0, 12);
    const client = await pool.connect();
    let saved;
    try {
      await client.query("BEGIN");
      saved = await client.query("INSERT INTO files (owner_id, original_name, mime_type, extension, size_bytes, storage_key, status) VALUES ($1, $2, $3, $4, $5, $6, 'ready') RETURNING id, created_at",
        [user.id, req.file.originalname, req.file.mimetype, path.extname(req.file.originalname).replace(/^\./, "") || null, uploaded.bytes, uploaded.public_id]);
      await client.query("INSERT INTO share_links (file_id, slug) VALUES ($1, $2)", [saved.rows[0].id, slug]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    return res.status(201).json({ ok: true, file: { id: saved.rows[0].id, name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype, resourceType: uploaded.resource_type, publicId: uploaded.public_id, slug, bytes: uploaded.bytes, format: uploaded.format, createdAt: saved.rows[0].created_at } });
  } catch (error) {
    console.error("File upload failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(502).json({ error: "Upload failed. Please try again." });
  }
});
app.get("/api/files", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await pool.query("SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at, sl.slug, sl.is_active AS share_active, COALESCE(ev.views, 0)::int AS views FROM files f LEFT JOIN share_links sl ON sl.file_id = f.id LEFT JOIN (SELECT file_id, COUNT(*) AS views FROM file_events WHERE event_type = 'view' GROUP BY file_id) ev ON ev.file_id = f.id WHERE f.owner_id = $1 AND f.status = 'ready' ORDER BY f.created_at DESC LIMIT 200", [user.id]);
    const files = result.rows.map(row => {
      const extension = path.extname(row.original_name).toLowerCase();
      const type = row.mime_type?.startsWith("video/") ? "Video" : row.mime_type?.startsWith("image/") ? "Image" : row.mime_type?.includes("pdf") ? "Document" : [".zip", ".apk", ".rar", ".7z"].includes(extension) ? "Archive" : "File";
      return { id: row.id, name: row.original_name, type, size: Number(row.size_bytes), date: row.created_at, views: Number(row.views || 0), slug: row.slug, shareActive: row.share_active !== false };
    });
    return res.json({ ok: true, files });
  } catch (error) {
    console.error("File list failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not load saved files." });
  }
});

app.patch("/api/files/:id", requireAuth, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 180 || name.includes("/") || name.includes("\\") || /[\u0000-\u001f\u007f]/.test(name)) {
    return res.status(400).json({ error: "Enter a valid file name (up to 180 characters)." });
  }
  try {
    const user = (req as any).user;
    const existing = await pool.query("SELECT id, original_name, extension FROM files WHERE id = $1 AND owner_id = $2 AND status = 'ready' LIMIT 1", [req.params.id, user.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "File not found." });
    const previousExtension = String(existing.rows[0].extension || path.extname(existing.rows[0].original_name).slice(1) || "").toLowerCase();
    const requestedExtension = path.extname(name).slice(1).toLowerCase();
    if (previousExtension !== requestedExtension) return res.status(400).json({ error: "Keep the original file extension when renaming." });
    const updated = await pool.query("UPDATE files SET original_name = $1 WHERE id = $2 AND owner_id = $3 AND status = 'ready' RETURNING id, original_name", [name, req.params.id, user.id]);
    return res.json({ ok: true, file: { id: updated.rows[0].id, name: updated.rows[0].original_name } });
  } catch (error) {
    console.error("File rename failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not rename this file." });
  }
});

app.patch("/api/files/:id/share", requireAuth, async (req, res) => {
  if (typeof req.body?.active !== "boolean") return res.status(400).json({ error: "Share status must be true or false." });
  try {
    const user = (req as any).user;
    const updated = await pool.query(
      "UPDATE share_links sl SET is_active = $1 FROM files f WHERE sl.file_id = f.id AND f.id = $2 AND f.owner_id = $3 AND f.status = 'ready' RETURNING sl.slug, sl.is_active",
      [req.body.active, req.params.id, user.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: "File or share link not found." });
    return res.json({ ok: true, share: { slug: updated.rows[0].slug, active: updated.rows[0].is_active } });
  } catch (error) {
    console.error("Share-link update failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not update the share link." });
  }
});

app.delete("/api/files/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const client = await pool.connect();
  let storageKey = "";
  let mimeType = "";
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT storage_key, mime_type FROM files WHERE id = $1 AND owner_id = $2 AND status = 'ready' FOR UPDATE",
      [req.params.id, user.id]
    );
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "File not found." });
    }
    storageKey = existing.rows[0].storage_key;
    mimeType = existing.rows[0].mime_type || "";
    await client.query("UPDATE files SET status = 'deleted' WHERE id = $1 AND owner_id = $2", [req.params.id, user.id]);
    await client.query("UPDATE share_links SET is_active = false WHERE file_id = $1", [req.params.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("File deletion failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not delete this file." });
  } finally {
    client.release();
  }

  let storageCleanup = "not_configured";
  if (env.CLOUDINARY_URL && storageKey) {
    try {
      cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });
      const resourceType = mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "raw";
      const result = await cloudinary.uploader.destroy(storageKey, { resource_type: resourceType, invalidate: true });
      storageCleanup = result?.result || "unknown";
    } catch (error) {
      storageCleanup = "failed";
      console.error("Cloudinary cleanup failed for deleted file:", error instanceof Error ? error.message : "Unknown error");
    }
  }
  return res.json({ ok: true, storageCleanup });
});

app.get("/api/share/:slug", async (req, res) => {
  try {
    const result = await pool.query("SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at, u.display_name FROM share_links sl JOIN files f ON f.id = sl.file_id JOIN users u ON u.id = f.owner_id WHERE sl.slug = $1 AND sl.is_active = true AND f.status = 'ready' AND (sl.expires_at IS NULL OR sl.expires_at > NOW()) LIMIT 1", [req.params.slug]);
    if (!result.rows[0]) return res.status(404).json({ error: "This share link is unavailable." });
    const file = result.rows[0];
    await pool.query("INSERT INTO file_events (file_id, event_type) VALUES ($1, 'view')", [file.id]);
    return res.json({ ok: true, file: { name: file.original_name, mimeType: file.mime_type, size: Number(file.size_bytes), createdAt: file.created_at, creator: file.display_name } });
  } catch (error) {
    console.error("Share lookup failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not load this share link." });
  }
});

app.get("/api/storage/status", async (_req, res) => {
  if (!env.CLOUDINARY_URL) return res.status(503).json({ ok: false, storage: "not_configured", provider: "cloudinary" });
  try { cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL }); await cloudinary.api.ping(); return res.json({ ok: true, storage: "connected", provider: "cloudinary" }); }
  catch (error) { console.error("Cloudinary connection check failed:", error instanceof Error ? error.message : "Unknown error"); return res.status(503).json({ ok: false, storage: "connection_failed", provider: "cloudinary" }); }
});
app.get("/api/ready", async (_req, res) => {
  try { await checkDatabase(); res.json({ ok: true, database: "connected" }); }
  catch (error) { res.status(503).json({ ok: false, database: "not_ready", message: error instanceof Error ? error.message : "Database check failed" }); }
});
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found" }));
app.use(express.static(webDirectory));
app.get("/{*splat}", (_req, res) => res.sendFile(webIndex));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error("Unhandled API error:", error); res.status(500).json({ error: "Internal server error" }); });

const server = app.listen(env.PORT, "0.0.0.0", () => console.log(`ShareDabba listening on port ${env.PORT}`));
async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
