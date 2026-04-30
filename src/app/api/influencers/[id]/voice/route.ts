import { NextRequest, NextResponse } from "next/server";
import { db, schema, ready } from "@/lib/db";
import { eq } from "drizzle-orm";
import { persistFromBuffer, deleteByKey } from "@/lib/storage";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
]);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function extFor(file: File) {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : null;
  if (ext && /^(mp3|wav|m4a|webm|ogg|mp4)$/.test(ext)) return ext;
  if (file.type.includes("mpeg")) return "mp3";
  if (file.type.includes("wav")) return "wav";
  if (file.type.includes("webm")) return "webm";
  if (file.type.includes("ogg")) return "ogg";
  return "wav";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).limit(1)
  )[0];
  if (!inf) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file in 'file' field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 25 MB)" }, { status: 400 });
  }
  // Some browsers and tools send "application/octet-stream" for audio. We
  // accept that and rely on the extension instead.
  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    !ALLOWED_TYPES.has(file.type)
  ) {
    return NextResponse.json(
      { error: `unsupported audio type: ${file.type}` },
      { status: 400 },
    );
  }

  // F5-TTS clones best from a clean 8-15s clip; we'll persist whatever the
  // user uploads (no trimming server-side) and let them iterate.
  const ext = extFor(file);
  const buf = Buffer.from(await file.arrayBuffer());
  const persisted = await persistFromBuffer(buf, {
    key: `${id}/voice/ref.${ext}`,
    ext,
  });

  await db
    .update(schema.influencers)
    .set({ voiceRefUrl: persisted.url })
    .where(eq(schema.influencers.id, id));

  return NextResponse.json({ ok: true, voiceRefUrl: persisted.url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).limit(1)
  )[0];
  if (!inf?.voiceRefUrl) return NextResponse.json({ ok: true });

  // The storage key is encoded in the URL (/api/assets/<key>) — strip the prefix.
  const key = inf.voiceRefUrl.replace(/^\/api\/assets\//, "");
  await deleteByKey(key).catch(() => {});
  await db
    .update(schema.influencers)
    .set({ voiceRefUrl: null })
    .where(eq(schema.influencers.id, id));
  return NextResponse.json({ ok: true });
}
