import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { env } from "./config.js";
import { checkDatabase, pool } from "./db.js";
import { v2 as cloudinary } from "cloudinary";

const app = express();
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
