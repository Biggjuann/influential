import "server-only";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getProvider } from "../providers";
import { downloadToDisk } from "../storage";
import { toAbsoluteUrl } from "../publicUrl";
import type { Persona } from "../db/schema";

export type SceneSpec = {
  scene: string;       // e.g. "sitting on a balcony at sunset, Lisbon rooftops"
  outfit?: string;     // e.g. "oversized cream knit sweater"
  pose?: string;       // e.g. "looking over shoulder, slight smile"
  expression?: string;
};

function buildPrompt(persona: Persona, scene: SceneSpec) {
  const parts = [
    persona.visualPrompt,
    scene.outfit ? `wearing ${scene.outfit}` : "",
    scene.pose ?? "",
    scene.expression ?? "",
    scene.scene,
  ].filter(Boolean);
  return parts.join(", ");
}

export async function generateInfluencerImages(args: {
  influencerId: string;
  scenes: SceneSpec[];
  useCanonicalAsReference?: boolean;
  onProgress?: (p: number, step: string) => void;
}) {
  const inf = db.select().from(schema.influencers).where(eq(schema.influencers.id, args.influencerId)).get();
  if (!inf) throw new Error("influencer not found");

  let referenceUrl: string | undefined;
  if (args.useCanonicalAsReference && inf.canonicalImageId) {
    const ref = db.select().from(schema.assets).where(eq(schema.assets.id, inf.canonicalImageId)).get();
    if (ref?.url) referenceUrl = toAbsoluteUrl(ref.url);
  }

  const provider = getProvider();
  const created: { id: string; url: string; scene: string }[] = [];

  for (let i = 0; i < args.scenes.length; i++) {
    const scene = args.scenes[i];
    args.onProgress?.(Math.round(((i + 0.1) / args.scenes.length) * 100), `generating: ${scene.scene}`);

    const out = await provider.generateImage({
      prompt: buildPrompt(inf.persona, scene),
      negativePrompt: inf.persona.negativePrompt,
      aspectRatio: "9:16",
      faceReferenceUrl: referenceUrl,
      count: 1,
    });

    for (const img of out.images) {
      const downloaded = await downloadToDisk(img.url, "jpg", `${inf.id}/images`);
      const id = nanoid(12);
      db.insert(schema.assets)
        .values({
          id,
          influencerId: inf.id,
          kind: "image",
          url: downloaded.publicUrl,
          localPath: downloaded.path,
          meta: { scene: scene.scene, seed: img.seed, sourceUrl: img.url },
        })
        .run();
      created.push({ id, url: downloaded.publicUrl, scene: scene.scene });
    }
    args.onProgress?.(Math.round(((i + 1) / args.scenes.length) * 100), `done ${i + 1}/${args.scenes.length}`);
  }

  return { assets: created };
}

// Initial pack of scenes used right after persona creation, to build a reference set.
export const STARTER_SCENES: SceneSpec[] = [
  { scene: "neutral studio backdrop, soft beauty light, head and shoulders", pose: "looking directly at camera, relaxed neutral expression", outfit: "plain white tee" },
  { scene: "morning kitchen with sunlight through linen curtains", pose: "leaning on counter holding a mug", outfit: "oversized cream knit sweater" },
  { scene: "city street golden hour, shallow depth of field", pose: "candid mid-laugh, hair caught in wind", outfit: "vintage leather jacket over a slip dress" },
  { scene: "cafe interior, espresso machine bokeh", pose: "seated at a window, glancing aside", outfit: "tailored beige blazer" },
];
