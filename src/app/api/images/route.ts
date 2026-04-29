import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateInfluencerImages } from "@/lib/pipeline/images";
import { createJob, runJob, updateJob } from "@/lib/jobs";

const Body = z.object({
  influencerId: z.string(),
  scenes: z
    .array(
      z.object({
        scene: z.string(),
        outfit: z.string().optional(),
        pose: z.string().optional(),
        expression: z.string().optional(),
      }),
    )
    .min(1),
  useCanonicalAsReference: z.boolean().default(true),
  engine: z.enum(["face-lock", "seedream", "flux-pro", "recraft"]).default("face-lock"),
});

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = Body.parse(await req.json());
  const jobId = await createJob("images", body.influencerId, body);

  void (async () => {
    try {
      await runJob(jobId, async (update) =>
        generateInfluencerImages({
          influencerId: body.influencerId,
          scenes: body.scenes,
          useCanonicalAsReference: body.useCanonicalAsReference,
          engine: body.engine,
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
