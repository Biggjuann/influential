import { NextRequest, NextResponse } from "next/server";
import { db, schema, ready } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const PersonaPatch = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
  ethnicity: z.string().optional(),
  hair: z.string().optional(),
  eyes: z.string().optional(),
  build: z.string().optional(),
  style: z.string().optional(),
  backstory: z.string().optional(),
  voiceDescription: z.string().optional(),
  contentPillars: z.array(z.string()).optional(),
  visualPrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
});

const Body = z.object({
  canonicalImageId: z.string().optional(),
  name: z.string().min(1).optional(),
  niche: z.string().min(1).optional(),
  persona: PersonaPatch.optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).limit(1)
  )[0];
  if (!inf) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allAssets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.influencerId, id))
    .orderBy(desc(schema.assets.createdAt));

  return NextResponse.json({
    influencer: inf,
    images: allAssets.filter((a) => a.kind === "image"),
    videos: allAssets.filter((a) => a.kind === "video"),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const body = Body.parse(await req.json());

  const updates: Record<string, unknown> = {};
  if (body.canonicalImageId) updates.canonicalImageId = body.canonicalImageId;
  if (body.name) updates.name = body.name;
  if (body.niche) updates.niche = body.niche;

  if (body.persona) {
    const current = (
      await db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).limit(1)
    )[0];
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
    updates.persona = { ...current.persona, ...body.persona };
  }

  if (Object.keys(updates).length > 0) {
    await db.update(schema.influencers).set(updates).where(eq(schema.influencers.id, id));
  }
  return NextResponse.json({ ok: true });
}
