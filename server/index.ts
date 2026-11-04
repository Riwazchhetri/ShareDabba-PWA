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
    const result = await pool.query("SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at, sl.slug FROM files f LEFT JOIN share_links sl ON sl.file_id = f.id AND sl.is_active = true WHERE f.owner_id = $1 AND f.status = 'ready' ORDER BY f.created_at DESC LIMIT 200", [user.id]);
    const files = result.rows.map(row => {
      const extension = path.extname(row.original_name).toLowerCase();
      const type = row.mime_type?.startsWith("video/") ? "Video" : row.mime_type?.startsWith("image/") ? "Image" : row.mime_type?.includes("pdf") ? "Document" : [".zip", ".apk", ".rar", ".7z"].includes(extension) ? "Archive" : "File";
      return { id: row.id, name: row.original_name, type, size: Number(row.size_bytes), date: row.created_at, views: 0, slug: row.slug };
    });
    return res.json({ ok: true, files });
  } catch (error) {
    console.error("File list failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not load saved files." });
  }
});

app.get("/api/share/:slug", async (req, res) => {
  try {
    const result = await pool.query("SELECT f.original_name, f.mime_type, f.size_bytes, f.created_at, u.display_name FROM share_links sl JOIN files f ON f.id = sl.file_id JOIN users u ON u.id = f.owner_id WHERE sl.slug = $1 AND sl.is_active = true AND f.status = 'ready' AND (sl.expires_at IS NULL OR sl.expires_at > NOW()) LIMIT 1", [req.params.slug]);
    if (!result.rows[0]) return res.status(404).json({ error: "This share link is unavailable." });
    const file = result.rows[0];
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
