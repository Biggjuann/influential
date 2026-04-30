import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db, schema, ready } from "@/lib/db";
import { createJob, runJob, updateJob } from "@/lib/jobs";
import { generateStory } from "@/lib/pipeline/story";
import { eq, desc } from "drizzle-orm";

const Body = z.object({
  influencerId: z.string(),
  title: z.string().min(1),
  globalCaption: z.string().default(""),
  fullScript: z.string().min(1),
  scenes: z
    .array(
      z.object({
        visualDirection: z.string().min(1),
        durationSec: z.number().int().min(5).max(15).default(5),
        sourceImageId: z.string().optional(),
        shotType: z.enum(["subject", "scenery", "detail"]).default("subject"),
      }),
    )
    .min(1)
    .max(10),
  mode: z.enum(["draft", "standard", "premium"]).default("standard"),
  format: z
    .enum(["ugc", "tutorial", "unboxing", "product_review", "try_on", "travel", "cinematic"])
    .default("cinematic"),
  aspectRatio: z
    .enum(["auto", "9:16", "16:9", "1:1", "3:4", "4:3", "21:9"])
    .default("9:16"),
  quality: z.enum(["480p", "720p", "1080p"]).default("1080p"),
  productId: z.string().optional(),
});

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await ready();
  const url = new URL(req.url);
  const influencerId = url.searchParams.get("influencerId");
  const rows = influencerId
    ? await db
        .select()
        .from(schema.stories)
        .where(eq(schema.stories.influencerId, influencerId))
        .orderBy(desc(schema.stories.createdAt))
    : await db.select().from(schema.stories).orderBy(desc(schema.stories.createdAt));
  return NextResponse.json({ stories: rows });
}

export async function POST(req: NextRequest) {
  await ready();
  const body = Body.parse(await req.json());

  const id = nanoid(12);
  await db.insert(schema.stories).values({
    id,
    influencerId: body.influencerId,
    title: body.title,
    globalCaption: body.globalCaption,
    fullScript: body.fullScript,
    scenes: body.scenes,
    mode: body.mode,
    format: body.format,
    aspectRatio: body.aspectRatio,
    quality: body.quality,
    productId: body.productId ?? null,
    status: "queued",
  });

  const jobId = await createJob("story", body.influencerId, { storyId: id });
  await db
    .update(schema.stories)
    .set({ status: "rendering" })
    .where(eq(schema.stories.id, id));

  void (async () => {
    try {
      await runJob(jobId, async (update) => generateStory({ storyId: id, onProgress: update }));
    } catch (err) {
      await updateJob(jobId, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return NextResponse.json({ id, jobId });
}
