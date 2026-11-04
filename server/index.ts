import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config";
import { checkDatabase, pool } from "./db";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(env.PORT, () => {
  console.log(`ShareDabba API listening on http://localhost:${env.PORT}`);
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