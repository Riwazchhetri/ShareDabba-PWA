import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import multer from "multer";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { env } from "./config.js";
import { checkDatabase, pool } from "./db.js";
import { v2 as cloudinary } from "cloudinary";

const app = express();
const UPLOAD_OWNER_ID = "a47e8c0a-a4d1-41eb-bba7-d7b4ed06e26b";
const webDirectory = path.resolve(process.cwd(), "dist/web");
const webIndex = path.join(webDirectory, "index.html");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.WEB_ORIGIN.split(",").map((origin) => origin.trim()) }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sharedabba-api",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

function hasValidUploadKey(value: string | undefined): boolean {
  const expected = env.UPLOAD_ACCESS_KEY;
  if (!expected || !value) return false;
  const suppliedBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

app.post("/api/files/upload", (req, res, next) => {
  if (!hasValidUploadKey(req.header("x-upload-key"))) {
    return res.status(401).json({ error: "Upload access key is missing or invalid." });
  }
  next();
}, uploadMiddleware.single("file"), async (req, res) => {
  if (!env.CLOUDINARY_URL) {
    return res.status(503).json({ error: "Cloud storage is not configured." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Choose a file to upload." });
  }

  try {
    cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });
    const resourceType = req.file.mimetype.startsWith("video/") ? "video"
      : req.file.mimetype.startsWith("image/") ? "image" : "raw";
    const uploaded = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: "sharedabba",
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        
      }, (error, result) => error ? reject(error) : resolve(result));
      stream.end(req.file!.buffer);
    });
    const slug = randomUUID().replace(/-/g, "").slice(0, 12);
    const saved = await pool.query(
      "INSERT INTO files (owner_id, original_name, mime_type, extension, size_bytes, storage_key, status) VALUES ($1, $2, $3, $4, $5, $6, 'ready') RETURNING id, created_at",
      [UPLOAD_OWNER_ID, req.file.originalname, req.file.mimetype, path.extname(req.file.originalname).replace(/^\\./, "") || null, uploaded.bytes, uploaded.public_id]
    );
    const fileId = saved.rows[0].id as string;
    await pool.query("INSERT INTO share_links (file_id, slug) VALUES ($1, $2)", [fileId, slug]);
    return res.status(201).json({
      ok: true,
      file: {
        id: fileId,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        resourceType: uploaded.resource_type,
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
        shareUrl: uploaded.secure_url,
        slug,
        bytes: uploaded.bytes,
        format: uploaded.format,
        createdAt: saved.rows[0].created_at
      }
    });
  } catch (error) {
    console.error("Cloudinary upload failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(502).json({ error: "Cloud upload failed. Please try again." });
  }
});

app.get("/api/files", async (req, res) => {
  if (!hasValidUploadKey(req.header("x-upload-key"))) {
    return res.status(401).json({ error: "Upload access key is missing or invalid." });
  }
  try {
    const result = await pool.query(
      "SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.storage_key, f.created_at, sl.slug FROM files f LEFT JOIN share_links sl ON sl.file_id = f.id AND sl.is_active = true WHERE f.owner_id = $1 AND f.status = 'ready' ORDER BY f.created_at DESC LIMIT 200",
      [UPLOAD_OWNER_ID]
    );
    const files = result.rows.map(row => {
      const extension = path.extname(row.original_name).toLowerCase();
      const type = row.mime_type?.startsWith("video/") ? "Video" : row.mime_type?.startsWith("image/") ? "Image" : row.mime_type?.includes("pdf") ? "Document" : [".zip", ".apk", ".rar", ".7z"].includes(extension) ? "Archive" : "File";
      return { id: row.id, name: row.original_name, type, size: Number(row.size_bytes), date: row.created_at, views: 0, slug: row.slug, url: null, storageKey: row.storage_key };
    });
    return res.json({ ok: true, files });
  } catch (error) {
    console.error("File list failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ error: "Could not load saved files." });
  }
});

app.get("/api/storage/status", async (_req, res) => {
  if (!env.CLOUDINARY_URL) {
    return res.status(503).json({ ok: false, storage: "not_configured", provider: "cloudinary" });
  }
  try {
    cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });
    await cloudinary.api.ping();
    return res.json({ ok: true, storage: "connected", provider: "cloudinary" });
  } catch (error) {
    console.error("Cloudinary connection check failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(503).json({ ok: false, storage: "connection_failed", provider: "cloudinary" });
  }
});

app.get("/api/ready", async (_req, res) => {
  try {
    await checkDatabase();
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: "not_ready",
      message: error instanceof Error ? error.message : "Database check failed"
    });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use(express.static(webDirectory));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(webIndex);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`ShareDabba listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
