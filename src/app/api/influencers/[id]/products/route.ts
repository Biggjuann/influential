import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db, schema, ready } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { persistFromBuffer } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB per image
const MAX_IMAGES = 8;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const rows = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.influencerId, id))
    .orderBy(desc(schema.products.createdAt));
  return NextResponse.json({ products: rows });
}

const TextBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  externalUrl: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;

  // Accept either JSON (no images) or multipart (name + 0..N image uploads).
  const ct = req.headers.get("content-type") ?? "";
  let name: string;
  let description: string | undefined;
  let externalUrl: string | undefined;
  const imageUrls: string[] = [];
  const productId = nanoid(12);

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const fields = TextBody.safeParse({
      name: form.get("name"),
      description: form.get("description") || undefined,
      externalUrl: form.get("externalUrl") || undefined,
    });
    if (!fields.success) {
      return NextResponse.json({ error: fields.error.message }, { status: 400 });
    }
    name = fields.data.name;
    description = fields.data.description;
    externalUrl = fields.data.externalUrl;

    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `too many images (max ${MAX_IMAGES})` },
        { status: 400 },
      );
    }
    for (const [i, file] of files.entries()) {
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `image ${i + 1} exceeds ${MAX_IMAGE_BYTES} bytes` },
          { status: 400 },
        );
      }
      if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `image ${i + 1} unsupported type: ${file.type}` },
          { status: 400 },
        );
      }
      const ext = (file.type || "").includes("png") ? "png" : (file.type || "").includes("webp") ? "webp" : "jpg";
      const buf = Buffer.from(await file.arrayBuffer());
      const persisted = await persistFromBuffer(buf, {
        key: `${id}/products/${productId}/img${i}.${ext}`,
        ext,
      });
      imageUrls.push(persisted.url);
    }
  } else {
    const body = TextBody.parse(await req.json());
    name = body.name;
    description = body.description;
    externalUrl = body.externalUrl;
  }

  await db.insert(schema.products).values({
    id: productId,
    influencerId: id,
    name,
    description: description ?? null,
    externalUrl: externalUrl ?? null,
    images: imageUrls,
  });

  const created = (
    await db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.influencerId, id)))
      .limit(1)
  )[0];
  return NextResponse.json({ product: created });
}
