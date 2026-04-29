import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { generatePersona } from "@/lib/providers/anthropic";
import { generateInfluencerImages, STARTER_SCENES } from "@/lib/pipeline/images";
import { createJob, runJob, updateJob } from "@/lib/jobs";
import { eq } from "drizzle-orm";

const Body = z.object({
  niche: z.string().min(1),
  vibe: z.string().optional(),
  gender: z.string().optional(),
});

export const runtime = "nodejs";

export async function GET() {
  const rows = db.select().from(schema.influencers).all();
  return NextResponse.json({ influencers: rows });
}

export async function POST(req: NextRequest) {
  const body = Body.parse(await req.json());

  const persona = await generatePersona(body);
  const id = nanoid(12);
  db.insert(schema.influencers)
    .values({
      id,
      name: persona.name,
      niche: body.niche,
      persona,
    })
    .run();

  // Kick off starter image pack as a background job. Do not await — return immediately.
  const jobId = await createJob("images", id, { scenes: STARTER_SCENES });
  void (async () => {
    try {
      const result = await runJob(jobId, async (update) => {
        return generateInfluencerImages({
          influencerId: id,
          scenes: STARTER_SCENES,
          useCanonicalAsReference: false,
          onProgress: update,
        });
      });
      // Auto-pick the first generated image as canonical so video gen works immediately.
      const first = result.assets[0];
      if (first) {
        db.update(schema.influencers)
          .set({ canonicalImageId: first.id })
          .where(eq(schema.influencers.id, id))
          .run();
      }
    } catch (err) {
      updateJob(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  })();

  return NextResponse.json({ id, persona, jobId });
}
