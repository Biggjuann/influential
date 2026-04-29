import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — point it at your Postgres instance (Railway provides this automatically).");
}

// Railway internal Postgres URLs don't need TLS; managed external ones do.
// node-postgres autodetects via the URL — leave ssl undefined.
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  ssl: needsSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});

function needsSsl(url: string) {
  if (process.env.PGSSLMODE === "disable") return false;
  if (url.includes("sslmode=disable")) return false;
  if (/\.railway\.internal/.test(url)) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

let initialized = false;
async function ensureSchema() {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS influencers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      niche TEXT NOT NULL,
      persona JSONB NOT NULL,
      canonical_image_id TEXT,
      voice_ref_url TEXT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      influencer_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      url TEXT NOT NULL,
      storage_key TEXT,
      meta JSONB,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      influencer_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      step TEXT,
      input JSONB,
      output JSONB,
      error TEXT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
    CREATE INDEX IF NOT EXISTS idx_assets_influencer ON assets(influencer_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_influencer ON jobs(influencer_id);
  `);
  initialized = true;
}

const initPromise = ensureSchema();
export async function ready() {
  await initPromise;
}

export const db = drizzle(pool, { schema });
export { schema };
