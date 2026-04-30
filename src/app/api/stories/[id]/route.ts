import { NextRequest, NextResponse } from "next/server";
import { db, schema, ready } from "@/lib/db";
import { eq } from "drizzle-orm";
import { deleteByKey } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const story = (
    await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1)
  )[0];
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });

  const output = story.outputAssetId
    ? (
        await db.select().from(schema.assets).where(eq(schema.assets.id, story.outputAssetId)).limit(1)
      )[0]
    : null;

  return NextResponse.json({ story, output });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ready();
  const { id } = await params;
  const story = (
    await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1)
  )[0];
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (story.outputAssetId) {
    const a = (
      await db.select().from(schema.assets).where(eq(schema.assets.id, story.outputAssetId)).limit(1)
    )[0];
    if (a?.storageKey) await deleteByKey(a.storageKey);
    await db.delete(schema.assets).where(eq(schema.assets.id, story.outputAssetId));
  }
  await db.delete(schema.stories).where(eq(schema.stories.id, id));

  return NextResponse.json({ ok: true });
}
