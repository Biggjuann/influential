import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).get();
  if (!inf) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allAssets = db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.influencerId, id))
    .orderBy(desc(schema.assets.createdAt))
    .all();

  return NextResponse.json({
    influencer: inf,
    images: allAssets.filter((a) => a.kind === "image"),
    videos: allAssets.filter((a) => a.kind === "video"),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { canonicalImageId?: string };
  if (body.canonicalImageId) {
    db.update(schema.influencers)
      .set({ canonicalImageId: body.canonicalImageId })
      .where(eq(schema.influencers.id, id))
      .run();
  }
  return NextResponse.json({ ok: true });
}
