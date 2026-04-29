import "server-only";
import { db, schema } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

type JobKind = "persona" | "images" | "video";

export async function createJob(
  kind: JobKind,
  influencerId: string | null,
  input: Record<string, unknown>,
) {
  const id = nanoid(12);
  db.insert(schema.jobs)
    .values({
      id,
      influencerId,
      kind,
      status: "queued",
      progress: 0,
      input,
    })
    .run();
  return id;
}

export function updateJob(
  id: string,
  patch: Partial<{
    status: "queued" | "running" | "done" | "error";
    progress: number;
    step: string;
    output: Record<string, unknown>;
    error: string;
  }>,
) {
  db.update(schema.jobs)
    .set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.jobs.id, id))
    .run();
}

export function getJob(id: string) {
  return db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
}

export async function runJob<T>(id: string, fn: (update: (p: number, step: string) => void) => Promise<T>) {
  updateJob(id, { status: "running", progress: 1, step: "starting" });
  try {
    const result = await fn((p, step) => updateJob(id, { progress: p, step }));
    updateJob(id, {
      status: "done",
      progress: 100,
      step: "done",
      output: result as Record<string, unknown>,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(id, { status: "error", error: msg });
    throw err;
  }
}
