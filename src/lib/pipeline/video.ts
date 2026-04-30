import "server-only";
import { db, schema, ready } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "../providers";
import type { QualityMode } from "../providers/types";
import { persistFromFile, persistFromUrl } from "../storage";
import { toAbsoluteUrl } from "../publicUrl";
import { generateScript } from "../providers/anthropic";
import { burnCaptionsAndCrop } from "./postprocess";
import { buildKeyframePrompt, buildKeyframeNegative, buildMotionPrompt } from "../promptStyle";
import type { Format } from "../formatPresets";

const VOICE_ENABLED = process.env.VOICE_ENABLED === "1";
const LIPSYNC_ENABLED = process.env.LIPSYNC_ENABLED === "1";

export async function generateVideo(args: {
  influencerId: string;
  topic: string;
  durationSec?: 5 | 8;
  mode?: QualityMode;
  variantCount?: number;
  format?: Format;
  // When set, animate this existing asset directly instead of generating a
  // fresh keyframe. Lets users pick a great image they already created
  // (Seedream / Flux Pro / hand-curated) without paying for a re-render.
  sourceImageId?: string;
  customScript?: {
    hook?: string;
    spokenLine?: string;
    captionText: string;
    hashtags?: string[];
    visualDirection: string;
  };
  onProgress?: (p: number, step: string) => void;
}) {
  await ready();
  const dur = args.durationSec ?? 5;
  const mode: QualityMode = args.mode ?? "standard";
  const variantCount = Math.max(1, Math.min(5, args.variantCount ?? 1));

  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, args.influencerId)).limit(1)
  )[0];
  if (!inf) throw new Error("influencer not found");
  if (!inf.canonicalImageId) throw new Error("influencer has no canonical image — pick one first");
  const format: Format = args.format ?? (inf.persona.defaultFormat as Format) ?? "cinematic";

  const canon = (
    await db.select().from(schema.assets).where(eq(schema.assets.id, inf.canonicalImageId)).limit(1)
  )[0];
  if (!canon) throw new Error("canonical image asset missing");

  const provider = getProvider();
  const jobId = nanoid(12);
  const skipped: string[] = [];

  let script: {
    hook: string;
    spokenLine: string;
    visualDirection: string;
    captionText: string;
    hashtags: string[];
  };

  if (args.customScript) {
    args.onProgress?.(8, "using your script");
    script = {
      hook: args.customScript.hook ?? "",
      spokenLine: args.customScript.spokenLine ?? "",
      visualDirection: args.customScript.visualDirection,
      captionText: args.customScript.captionText,
      hashtags: args.customScript.hashtags ?? [],
    };
  } else {
    args.onProgress?.(3, "writing script");
    script = (await generateScript({
      persona: {
        name: inf.persona.name,
        voiceDescription: inf.persona.voiceDescription,
        contentPillars: inf.persona.contentPillars,
      },
      topic: args.topic,
      durationSec: dur,
    })) as typeof script;
  }

  // Get the keyframe — either an existing user-picked asset, or a fresh
  // generation via Flux + PuLID (face-locked).
  let keyframeUrl: string;
  if (args.sourceImageId) {
    const src = (
      await db.select().from(schema.assets).where(eq(schema.assets.id, args.sourceImageId)).limit(1)
    )[0];
    if (!src) throw new Error("source image not found");
    if (src.influencerId !== inf.id) throw new Error("source image belongs to another influencer");
    args.onProgress?.(15, "using selected image as keyframe");
    keyframeUrl = toAbsoluteUrl(src.url);
  } else {
    args.onProgress?.(12, `rendering keyframe (${mode}/${format})`);
    const keyframe = await provider.generateImage({
      prompt: buildKeyframePrompt({
        visualDirection: script.visualDirection,
        format,
        shotType: "subject",
        characterPrompt: inf.persona.visualPrompt,
      }),
      negativePrompt: buildKeyframeNegative({
        format,
        shotType: "subject",
        personaNegative: inf.persona.negativePrompt,
      }),
      aspectRatio: "9:16",
      faceReferenceUrl: toAbsoluteUrl(canon.url),
      count: 1,
      mode,
      idWeightOverride: 0.7,
    });
    keyframeUrl = keyframe.images[0].url;

    // Save the freshly-generated keyframe so it isn't lost if a later step fails.
    await persistFromUrl(keyframeUrl, {
      key: `${inf.id}/keyframes/${jobId}.jpg`,
      ext: "jpg",
    })
      .then((persisted) =>
        db.insert(schema.assets).values({
          id: `kf_${jobId}`,
          influencerId: inf.id,
          kind: "image",
          url: persisted.url,
          storageKey: persisted.key,
          meta: { fromVideoJob: jobId, scene: script.visualDirection, mode },
        }),
      )
      .catch((e) => console.error("keyframe persist failed (non-fatal):", e));
  }

  // Voice (optional, shared across all variants)
  let audioUrl: string | undefined;
  if (VOICE_ENABLED) {
    try {
      args.onProgress?.(20, "voicing line");
      const tts = await provider.tts({
        text: script.spokenLine,
        voiceRefUrl: inf.voiceRefUrl ?? undefined,
        voiceDescription: inf.persona.voiceDescription,
      });
      audioUrl = tts.audioUrl;
    } catch (e) {
      skipped.push(`voice (${asMessage(e)})`);
    }
  } else {
    skipped.push("voice (VOICE_ENABLED=0)");
  }

  // Animate the keyframe N times to get N video variants. Each variant is its
  // own asset row so the user can pick a favorite without re-spending on
  // script/keyframe/voice.
  const tmp = await mkdtemp(join(tmpdir(), "influential-"));
  const created: { assetId: string; url: string }[] = [];
  try {
    const animationStart = 25;
    const animationEnd = 92;
    const stepSpan = (animationEnd - animationStart) / variantCount;

    for (let i = 0; i < variantCount; i++) {
      const variantId = variantCount === 1 ? jobId : `${jobId}_${i + 1}`;
      const baseProgress = animationStart + i * stepSpan;
      args.onProgress?.(
        Math.round(baseProgress),
        `animating ${i + 1}/${variantCount}`,
      );

      const video = await provider.generateVideo({
        imageUrl: keyframeUrl,
        prompt: buildMotionPrompt({
          visualDirection: script.visualDirection,
          format,
          shotType: "subject",
        }),
        durationSec: dur,
        mode,
      });

      let finalRemoteUrl = video.videoUrl;
      if (LIPSYNC_ENABLED && audioUrl) {
        try {
          args.onProgress?.(
            Math.round(baseProgress + stepSpan * 0.6),
            `syncing lips ${i + 1}/${variantCount}`,
          );
          const synced = await provider.lipsync({ videoUrl: video.videoUrl, audioUrl });
          finalRemoteUrl = synced.videoUrl;
        } catch (e) {
          skipped.push(`lipsync v${i + 1} (${asMessage(e)})`);
        }
      }

      const inputPath = await materializeToDisk(finalRemoteUrl, join(tmp, `in_${i}.mp4`));
      const outputPath = join(tmp, `out_${i}.mp4`);
      await burnCaptionsAndCrop({
        inputPath,
        outputPath,
        captionText: script.captionText,
        captionStyle: inf.persona.captionStyle ?? undefined,
        durationSec: dur,
      });

      const persisted = await persistFromFile(outputPath, {
        key: `${inf.id}/videos/${variantId}.mp4`,
        ext: "mp4",
      });

      await db.insert(schema.assets).values({
        id: variantId,
        influencerId: inf.id,
        kind: "video",
        url: persisted.url,
        storageKey: persisted.key,
        meta: {
          topic: args.topic,
          script,
          durationSec: dur,
          keyframeUrl,
          mode,
          variantIndex: variantCount > 1 ? i + 1 : undefined,
          variantOf: variantCount > 1 ? jobId : undefined,
          hadAudio: !!audioUrl,
          hadLipsync: finalRemoteUrl !== video.videoUrl,
        },
      });

      created.push({ assetId: variantId, url: persisted.url });
    }

    if (LIPSYNC_ENABLED && !audioUrl) skipped.push("lipsync (no audio)");
    else if (!LIPSYNC_ENABLED) skipped.push("lipsync (LIPSYNC_ENABLED=0)");

    args.onProgress?.(100, "done");
    return {
      assetId: created[0].assetId,
      url: created[0].url,
      script,
      mode,
      skipped,
      variants: created,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// Anchors what the I2V model is allowed to do. Kling/Wan/LTX default to
// generic gestures (hands rubbing, fidgeting) when the motion is vague,
// which reads like AI tell-tale movement. Adding explicit cinematic motion
// cues + an anti-pattern negative steers them toward natural ambient motion.
function asMessage(e: unknown) {
  return e instanceof Error ? e.message.slice(0, 100) : String(e).slice(0, 100);
}

async function materializeToDisk(url: string, destPath: string): Promise<string> {
  if (url.startsWith("file://")) return fileURLToPath(url);
  let buf: Buffer;
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const meta = url.slice(5, comma);
    const payload = url.slice(comma + 1);
    buf = meta.includes(";base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`materialize failed: ${res.status} ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  await writeFile(destPath, buf);
  return destPath;
}
