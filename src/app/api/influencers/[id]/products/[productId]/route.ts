import { NextRequest, NextResponse } from "next/server";
import { db, schema, ready } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { deleteByKey } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  await ready();
  const { id, productId } = await params;
  const row = (
    await db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.influencerId, id)))
      .limit(1)
  )[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ product: row });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  await ready();
  const { id, productId } = await params;
  const row = (
    await db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.influencerId, id)))
      .limit(1)
  )[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Best-effort delete of stored images.
  for (const url of row.images ?? []) {
    const key = url.replace(/^\/api\/assets\//, "");
    await deleteByKey(key).catch(() => {});
  }
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  return NextResponse.json({ ok: true });
}
