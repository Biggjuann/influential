import "server-only";
import { db, schema, ready } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

type JobKind = "persona" | "images" | "video";

export async function createJob(
  kind: JobKind,
  influencerId: string | null,
  input: Record<string, unknown>,
) {
  await ready();
  const id = nanoid(12);
  await db.insert(schema.jobs).values({
    id,
    influencerId,
    kind,
    status: "queued",
    progress: 0,
    input,
  });
  return id;
}

export async function updateJob(
  id: string,
  patch: Partial<{
    status: "queued" | "running" | "done" | "error";
    progress: number;
    step: string;
    output: Record<string, unknown>;
    error: string;
  }>,
) {
  await ready();
  await db
    .update(schema.jobs)
    .set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.jobs.id, id));
}

export async function getJob(id: string) {
  await ready();
  const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
  return rows[0];
}

export async function runJob<T>(
  id: string,
  fn: (update: (p: number, step: string) => void) => Promise<T>,
) {
  await updateJob(id, { status: "running", progress: 1, step: "starting" });
  try {
    const result = await fn((p, step) => {
      void updateJob(id, { progress: p, step });
    });
    await updateJob(id, {
      status: "done",
      progress: 100,
      step: "done",
      output: result as Record<string, unknown>,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(id, { status: "error", error: msg });
    throw err;
  }
}
