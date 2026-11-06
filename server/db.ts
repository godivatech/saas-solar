import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema.postgres";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Please check your environment variables.");
}

// Enterprise-grade connection pooling configuration for Neon PostgreSQL / PgBouncer
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 20,
  min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN, 10) : 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Guard against unexpected connection resets on idle clients (prevents Node.js unhandled crash)
pool.on("error", (err) => {
  console.error("⚠️ [Postgres Pool Warning] Unexpected idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

// Graceful shutdown handling to drain database connections cleanly
const handleShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Draining Neon PostgreSQL connection pool...`);
  try {
    await pool.end();
    console.log("✅ Neon PostgreSQL connection pool drained successfully.");
  } catch (err) {
    console.error("❌ Error draining pool during shutdown:", err);
  }
};

process.once("SIGTERM", () => handleShutdown("SIGTERM"));
process.once("SIGINT", () => handleShutdown("SIGINT"));

console.log("✅ Neon PostgreSQL & Drizzle ORM connected successfully with enterprise pooling");
