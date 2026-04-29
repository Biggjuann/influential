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
import { generateScript } from "../providers/anthropic";
import { burnCaptionsAndCrop } from "./postprocess";

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

  args.onProgress?.(15, "rendering keyframe");
  const keyframe = await provider.generateImage({
    prompt: `${inf.persona.visualPrompt}, ${script.visualDirection}`,
    negativePrompt: inf.persona.negativePrompt,
    aspectRatio: "9:16",
    faceReferenceUrl: canon.url,
    count: 1,
  });
  const keyframeUrl = keyframe.images[0].url;

  args.onProgress?.(35, "voicing line");
  const tts = await provider.tts({
    text: script.spokenLine,
    voiceRefUrl: inf.voiceRefUrl ?? undefined,
    voiceDescription: inf.persona.voiceDescription,
  });

  args.onProgress?.(50, "animating clip");
  const video = await provider.generateVideo({
    imageUrl: keyframeUrl,
    prompt: script.visualDirection,
    durationSec: dur,
  });

  args.onProgress?.(75, "syncing lips");
  const synced = await provider.lipsync({ videoUrl: video.videoUrl, audioUrl: tts.audioUrl });

  args.onProgress?.(88, "post-processing");
  const tmp = await mkdtemp(join(tmpdir(), "influential-"));
  try {
    const inputPath = await materializeToDisk(synced.videoUrl, join(tmp, "in.mp4"));
    const outputPath = join(tmp, "out.mp4");
    await burnCaptionsAndCrop({
      inputPath,
      outputPath,
      captionText: script.captionText,
    });

    const id = nanoid(12);
    const persisted = await persistFromFile(outputPath, {
      key: `${inf.id}/videos/${id}.mp4`,
      ext: "mp4",
    });

    // Also persist the raw keyframe alongside (useful for debugging / re-runs).
    void persistFromUrl(keyframeUrl, { key: `${inf.id}/keyframes/${id}.jpg`, ext: "jpg" }).catch(() => {});

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
      },
    });

    args.onProgress?.(100, "done");
    return { assetId: id, url: persisted.url, script };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// Bring a remote/data:/file: URL into a local temp path so ffmpeg can read it.
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
