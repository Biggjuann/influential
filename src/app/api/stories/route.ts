import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db, schema, ready } from "@/lib/db";
import { createJob, runJob, updateJob } from "@/lib/jobs";
import { generateStory } from "@/lib/pipeline/story";
import { parseDirectorsBrief } from "@/lib/providers/anthropic";
import { eq, desc } from "drizzle-orm";

// Two ways to create a Story:
//
// 1. STRUCTURED — caller already has scenes[], fullScript, etc. (the manual
//    Reels editor uses this).
// 2. BRIEF — caller pastes a free-form director's brief; Claude parses it
//    into the structured shape and we save + render it.
const StructuredBody = z.object({
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

const BriefBody = z.object({
  influencerId: z.string(),
  briefText: z.string().min(20),
  // The other fields are optional overrides — Claude infers them from the
  // brief, but the caller can pin any of them explicitly.
  title: z.string().optional(),
  mode: z.enum(["draft", "standard", "premium"]).default("standard"),
  format: z
    .enum(["ugc", "tutorial", "unboxing", "product_review", "try_on", "travel", "cinematic"])
    .optional(),
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
  const raw = await req.json();
  const id = nanoid(12);

  const isBrief = typeof raw?.briefText === "string" && raw.briefText.length >= 20;

  let title: string;
  let globalCaption: string;
  let fullScript: string;
  let scenes: Array<{
    visualDirection: string;
    durationSec: number;
    sourceImageId?: string;
    shotType: "subject" | "scenery" | "detail";
  }>;
  let mode: "draft" | "standard" | "premium";
  let format:
    | "ugc"
    | "tutorial"
    | "unboxing"
    | "product_review"
    | "try_on"
    | "travel"
    | "cinematic";
  let aspectRatio: "auto" | "9:16" | "16:9" | "1:1" | "3:4" | "4:3" | "21:9";
  let quality: "480p" | "720p" | "1080p";
  let productId: string | undefined;
  let influencerId: string;

  if (isBrief) {
    const body = BriefBody.parse(raw);
    influencerId = body.influencerId;
    mode = body.mode;
    aspectRatio = body.aspectRatio;
    quality = body.quality;
    productId = body.productId;

    const inf = (
      await db
        .select()
        .from(schema.influencers)
        .where(eq(schema.influencers.id, influencerId))
        .limit(1)
    )[0];
    if (!inf) return NextResponse.json({ error: "influencer not found" }, { status: 404 });

    let product: { name: string; description: string | null } | null = null;
    if (productId) {
      const p = (
        await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, productId))
          .limit(1)
      )[0];
      if (p && p.influencerId === influencerId) {
        product = { name: p.name, description: p.description };
      }
    }

    const parsed = await parseDirectorsBrief({
      brief: body.briefText,
      persona: {
        name: inf.persona.name,
        voiceDescription: inf.persona.voiceDescription,
        contentPillars: inf.persona.contentPillars,
      },
      defaultFormat: body.format ?? inf.persona.defaultFormat ?? undefined,
      product,
    });

    title = body.title ?? parsed.title ?? "Untitled reel";
    format = body.format ?? parsed.format ?? "ugc";
    globalCaption = parsed.globalCaption ?? "";
    fullScript = parsed.fullScript ?? "";
    scenes = parsed.beats.map((b) => ({
      visualDirection: b.visualDirection,
      // Clamp to our supported per-clip range so weird brief durations don't
      // explode in the I2V layer.
      durationSec: Math.max(5, Math.min(15, Math.round(b.durationSec))),
      shotType: b.shotType,
    }));
    if (scenes.length < 1) {
      return NextResponse.json(
        { error: "Couldn't extract any beats from the brief. Try adding clearer timestamps." },
        { status: 400 },
      );
    }
  } else {
    const body = StructuredBody.parse(raw);
    influencerId = body.influencerId;
    title = body.title;
    globalCaption = body.globalCaption;
    fullScript = body.fullScript;
    scenes = body.scenes;
    mode = body.mode;
    format = body.format;
    aspectRatio = body.aspectRatio;
    quality = body.quality;
    productId = body.productId;
  }

  await db.insert(schema.stories).values({
    id,
    influencerId,
    title,
    globalCaption,
    fullScript,
    scenes,
    mode,
    format,
    aspectRatio,
    quality,
    productId: productId ?? null,
    status: "queued",
  });

  const jobId = await createJob("story", influencerId, { storyId: id });
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

  return NextResponse.json({ id, jobId, parsedBeats: scenes.length });
}
