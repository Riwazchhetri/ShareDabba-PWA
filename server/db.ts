import pg from "pg";
import { env } from "./config";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

export async function checkDatabase(): Promise<void> {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add it to your local .env file.");
  }
  await pool.query("SELECT 1");
}

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});