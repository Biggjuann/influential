import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Connection setup is fully lazy: routes get imported during `next build` for
// page-data collection, before runtime env vars are available. Throwing here
// would break the build, so we defer until the first actual query.

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;
let _initPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — point it at your Postgres instance (Railway provides this automatically when you attach a Postgres add-on).",
    );
  }
  _pool = new Pool({
    connectionString: url,
    max: 5,
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
  });
  return _pool;
}

function needsSsl(url: string) {
  if (process.env.PGSSLMODE === "disable") return false;
  if (url.includes("sslmode=disable")) return false;
  if (/\.railway\.internal/.test(url)) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

async function ensureSchema() {
  await getPool().query(`
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
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      influencer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      global_caption TEXT NOT NULL DEFAULT '',
      full_script TEXT NOT NULL,
      scenes JSONB NOT NULL,
      mode TEXT NOT NULL DEFAULT 'standard',
      status TEXT NOT NULL DEFAULT 'queued',
      output_asset_id TEXT,
      error TEXT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
    CREATE INDEX IF NOT EXISTS idx_assets_influencer ON assets(influencer_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_influencer ON jobs(influencer_id);
    CREATE INDEX IF NOT EXISTS idx_stories_influencer ON stories(influencer_id);
  `);

  // Sweep stale jobs: anything in 'running' or 'queued' from before this
  // process started can't be alive (in-process promises die with the process).
  // Mark them errored so the UI stops showing a stuck progress bar.
  await getPool().query(
    `UPDATE jobs SET status='error', error=COALESCE(error, 'process restarted while job was running'), updated_at=extract(epoch from now())::bigint
     WHERE status IN ('running','queued')`,
  );
}

export async function ready() {
  _initPromise ??= ensureSchema();
  await _initPromise;
}

// Proxy that lazily resolves the underlying drizzle instance. Lets callers do
// `db.select()...` without us having to await initialization first.
export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    _db ??= drizzle(getPool(), { schema });
    return Reflect.get(_db, prop, _db);
  },
});

export { schema };
