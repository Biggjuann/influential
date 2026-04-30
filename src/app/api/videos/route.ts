import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db, schema, ready } from "@/lib/db";
import { generateVideo } from "@/lib/pipeline/video";
import { generateStory } from "@/lib/pipeline/story";
import { generateSequentialBeats } from "@/lib/providers/anthropic";
import { createJob, runJob, updateJob } from "@/lib/jobs";
import { getFormat, type Format } from "@/lib/formatPresets";

const Body = z.object({
  influencerId: z.string(),
  topic: z.string().min(1),
  durationSec: z.union([z.literal(5), z.literal(8)]).default(5),
  mode: z.enum(["draft", "standard", "premium"]).default("standard"),
  variantCount: z.number().int().min(1).max(5).default(1),
  shotMix: z.enum(["talking", "mixed", "travel"]).default("mixed"),
  format: z
    .enum(["ugc", "tutorial", "unboxing", "product_review", "try_on", "travel", "cinematic"])
    .optional(),
  sourceImageId: z.string().optional(),
  customScript: z
    .object({
      hook: z.string().optional(),
      spokenLine: z.string().optional(),
      captionText: z.string().min(1),
      hashtags: z.array(z.string()).optional(),
      visualDirection: z.string().min(1),
    })
    .optional(),
});

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await ready();
  const body = Body.parse(await req.json());

  // N>1 in auto mode = a sequential reel: Claude plans N beats with one
  // continuous voiceover, then we render it through the story pipeline so
  // the output is a single stitched MP4 (not N alternate takes).
  if (body.variantCount > 1 && !body.customScript) {
    const inf = (
      await db
        .select()
        .from(schema.influencers)
        .where(eq(schema.influencers.id, body.influencerId))
        .limit(1)
    )[0];
    if (!inf) {
      return NextResponse.json({ error: "influencer not found" }, { status: 404 });
    }

    const format: Format =
      body.format ?? (inf.persona.defaultFormat as Format | undefined) ?? "cinematic";
    const fmt = getFormat(format);
    const shotMix = body.shotMix ?? fmt.defaultShotMix;
    const planned = await generateSequentialBeats({
      persona: {
        name: inf.persona.name,
        voiceDescription: inf.persona.voiceDescription,
        contentPillars: inf.persona.contentPillars,
      },
      topic: body.topic,
      beatCount: body.variantCount,
      durationSecPerBeat: body.durationSec,
      shotMix,
      format,
      formatBeatPattern: fmt.beatPattern,
    });

    const storyId = nanoid(12);
    await db.insert(schema.stories).values({
      id: storyId,
      influencerId: body.influencerId,
      title: planned.title,
      globalCaption: planned.globalCaption ?? "",
      fullScript: planned.fullScript,
      scenes: planned.beats.map((b) => ({
        visualDirection: b.visualDirection,
        durationSec: body.durationSec,
        shotType: (b as { shotType?: "subject" | "scenery" | "detail" }).shotType ?? "subject",
      })),
      mode: body.mode,
      format,
      status: "rendering",
    });

    const jobId = await createJob("story", body.influencerId, { storyId });
    void (async () => {
      try {
        await runJob(jobId, async (update) =>
          generateStory({ storyId, onProgress: update }),
        );
      } catch (err) {
        await updateJob(jobId, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return NextResponse.json({ jobId, storyId, kind: "reel" });
  }

  // Single video (N=1 or any custom-script flow).
  const jobId = await createJob("video", body.influencerId, body);
  void (async () => {
    try {
      await runJob(jobId, async (update) =>
        generateVideo({
          influencerId: body.influencerId,
          topic: body.topic,
          durationSec: body.durationSec,
          mode: body.mode,
          variantCount: body.variantCount,
          format: body.format,
          sourceImageId: body.sourceImageId,
          customScript: body.customScript,
          onProgress: update,
        }),
      );
    } catch (err) {
      await updateJob(jobId, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return NextResponse.json({ jobId, kind: "video" });
}
