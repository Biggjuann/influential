import "server-only";
import { db, schema, ready } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "../providers";
import { persistFromFile, persistFromUrl } from "../storage";
import { toAbsoluteUrl } from "../publicUrl";
import { generateScript } from "../providers/anthropic";
import { burnCaptionsAndCrop } from "./postprocess";

// Step toggles: voice + lipsync are off by default because they're the most
// expensive + slowest + most fragile parts of the chain. The minimum viable
// output (script + keyframe + animation + caption) is enough for many TikTok
// formats. Flip these on once you have a working baseline.
const VOICE_ENABLED = process.env.VOICE_ENABLED === "1";
const LIPSYNC_ENABLED = process.env.LIPSYNC_ENABLED === "1";

export async function generateVideo(args: {
  influencerId: string;
  topic: string;
  durationSec?: 5 | 8;
  onProgress?: (p: number, step: string) => void;
}) {
  await ready();
  const dur = args.durationSec ?? 5;

  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, args.influencerId)).limit(1)
  )[0];
  if (!inf) throw new Error("influencer not found");
  if (!inf.canonicalImageId) throw new Error("influencer has no canonical image — pick one first");

  const canon = (
    await db.select().from(schema.assets).where(eq(schema.assets.id, inf.canonicalImageId)).limit(1)
  )[0];
  if (!canon) throw new Error("canonical image asset missing");

  const provider = getProvider();
  const id = nanoid(12);
  const skipped: string[] = [];

  args.onProgress?.(5, "writing script");
  const script = (await generateScript({
    persona: {
      name: inf.persona.name,
      voiceDescription: inf.persona.voiceDescription,
      contentPillars: inf.persona.contentPillars,
    },
    topic: args.topic,
    durationSec: dur,
  })) as {
    hook: string;
    spokenLine: string;
    visualDirection: string;
    captionText: string;
    hashtags: string[];
  };

  args.onProgress?.(20, "rendering keyframe");
  const keyframe = await provider.generateImage({
    prompt: `${inf.persona.visualPrompt}, ${script.visualDirection}`,
    negativePrompt: inf.persona.negativePrompt,
    aspectRatio: "9:16",
    faceReferenceUrl: toAbsoluteUrl(canon.url),
    count: 1,
  });
  const keyframeUrl = keyframe.images[0].url;

  // Save the keyframe as its own asset RIGHT AWAY so this success isn't lost
  // if a later step blows up.
  await persistFromUrl(keyframeUrl, {
    key: `${inf.id}/keyframes/${id}.jpg`,
    ext: "jpg",
  })
    .then((persisted) =>
      db.insert(schema.assets).values({
        id: `kf_${id}`,
        influencerId: inf.id,
        kind: "image",
        url: persisted.url,
        storageKey: persisted.key,
        meta: { fromVideoJob: id, scene: script.visualDirection },
      }),
    )
    .catch((e) => console.error("keyframe persist failed (non-fatal):", e));

  // Voice: optional, swallow failures so they don't kill the whole job.
  let audioUrl: string | undefined;
  if (VOICE_ENABLED) {
    try {
      args.onProgress?.(40, "voicing line");
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

  args.onProgress?.(55, "animating clip");
  const video = await provider.generateVideo({
    imageUrl: keyframeUrl,
    prompt: script.visualDirection,
    durationSec: dur,
  });

  // Lipsync: only if both voice succeeded AND lipsync is enabled. Optional.
  let finalRemoteUrl = video.videoUrl;
  if (LIPSYNC_ENABLED && audioUrl) {
    try {
      args.onProgress?.(80, "syncing lips");
      const synced = await provider.lipsync({ videoUrl: video.videoUrl, audioUrl });
      finalRemoteUrl = synced.videoUrl;
    } catch (e) {
      skipped.push(`lipsync (${asMessage(e)})`);
    }
  } else if (LIPSYNC_ENABLED && !audioUrl) {
    skipped.push("lipsync (no audio)");
  } else {
    skipped.push("lipsync (LIPSYNC_ENABLED=0)");
  }

  args.onProgress?.(90, "post-processing");
  const tmp = await mkdtemp(join(tmpdir(), "influential-"));
  try {
    const inputPath = await materializeToDisk(finalRemoteUrl, join(tmp, "in.mp4"));
    const outputPath = join(tmp, "out.mp4");
    await burnCaptionsAndCrop({
      inputPath,
      outputPath,
      captionText: script.captionText,
    });

    const persisted = await persistFromFile(outputPath, {
      key: `${inf.id}/videos/${id}.mp4`,
      ext: "mp4",
    });

    await db.insert(schema.assets).values({
      id,
      influencerId: inf.id,
      kind: "video",
      url: persisted.url,
      storageKey: persisted.key,
      meta: {
        topic: args.topic,
        script,
        durationSec: dur,
        keyframeUrl,
        skipped,
        hadAudio: !!audioUrl,
        hadLipsync: finalRemoteUrl !== video.videoUrl,
      },
    });

    args.onProgress?.(100, "done");
    return { assetId: id, url: persisted.url, script, skipped };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

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
