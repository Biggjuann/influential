import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateVideo } from "@/lib/pipeline/video";
import { createJob, runJob, updateJob } from "@/lib/jobs";

const Body = z.object({
  influencerId: z.string(),
  topic: z.string().min(1),
  durationSec: z.union([z.literal(5), z.literal(8)]).default(5),
  mode: z.enum(["draft", "standard", "premium"]).default("standard"),
  variantCount: z.number().int().min(1).max(5).default(1),
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
  const body = Body.parse(await req.json());
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

  return NextResponse.json({ jobId });
}
