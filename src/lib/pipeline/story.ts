import "server-only";
import { db, schema, ready } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { getProvider } from "../providers";
import type { QualityMode } from "../providers/types";
import { persistFromFile } from "../storage";
import { toAbsoluteUrl } from "../publicUrl";
import { renderCaptionPng } from "../captionOverlay";
import type { StoryScene } from "../db/schema";

const ffmpegBin = (ffmpegPath as unknown as string | null) ?? "ffmpeg";

export async function generateStory(args: {
  storyId: string;
  onProgress?: (p: number, step: string) => void;
}) {
  await ready();

  const story = (
    await db.select().from(schema.stories).where(eq(schema.stories.id, args.storyId)).limit(1)
  )[0];
  if (!story) throw new Error("story not found");

  const inf = (
    await db
      .select()
      .from(schema.influencers)
      .where(eq(schema.influencers.id, story.influencerId))
      .limit(1)
  )[0];
  if (!inf) throw new Error("influencer not found");
  const canon =
    inf.canonicalImageId
      ? (
          await db
            .select()
            .from(schema.assets)
            .where(eq(schema.assets.id, inf.canonicalImageId))
            .limit(1)
        )[0]
      : null;

  const provider = getProvider();
  const mode: QualityMode = (story.mode as QualityMode) ?? "standard";
  const totalSteps =
    story.scenes.length /* keyframes */ + story.scenes.length /* animations */ + 4;
  let step = 0;
  const tick = (label: string) => {
    step += 1;
    args.onProgress?.(Math.round((step / totalSteps) * 95), label);
  };

  const tmp = await mkdtemp(join(tmpdir(), "story-"));
  try {
    // 1. For each scene: get a keyframe (use sourceImageId if provided, else
    //    generate via face-locked Flux), then animate. Keep both URLs.
    const sceneVideoPaths: string[] = [];
    for (let i = 0; i < story.scenes.length; i++) {
      const scene = story.scenes[i];

      let keyframeUrl: string;
      if (scene.sourceImageId) {
        const src = (
          await db
            .select()
            .from(schema.assets)
            .where(eq(schema.assets.id, scene.sourceImageId))
            .limit(1)
        )[0];
        if (!src) throw new Error(`scene ${i + 1}: source image not found`);
        keyframeUrl = toAbsoluteUrl(src.url);
        tick(`scene ${i + 1}: using picked image`);
      } else {
        if (!canon) throw new Error("scene needs source image OR influencer needs canonical face");
        tick(`scene ${i + 1}: keyframe`);
        const kf = await provider.generateImage({
          prompt: `${inf.persona.visualPrompt}, ${scene.visualDirection}`,
          negativePrompt: inf.persona.negativePrompt,
          aspectRatio: "9:16",
          faceReferenceUrl: toAbsoluteUrl(canon.url),
          count: 1,
          mode,
        });
        keyframeUrl = kf.images[0].url;
      }

      tick(`scene ${i + 1}: animating`);
      const vid = await provider.generateVideo({
        imageUrl: keyframeUrl,
        prompt: buildMotionPrompt(scene.visualDirection),
        durationSec: scene.durationSec,
        mode,
      });

      const localPath = join(tmp, `scene_${i}.mp4`);
      await materializeToDisk(vid.videoUrl, localPath);
      sceneVideoPaths.push(localPath);
    }

    // 2. Voiceover for the whole script (single TTS call so the cadence is
    //    continuous instead of a chopped-up sequence).
    tick("voiceover");
    const tts = await provider.tts({
      text: story.fullScript,
      voiceRefUrl: inf.voiceRefUrl ?? undefined,
      voiceDescription: inf.persona.voiceDescription,
    });
    const audioPath = join(tmp, "voice.wav");
    await materializeToDisk(tts.audioUrl, audioPath);

    // 3. Concat + scale all scene clips into one silent reel.
    tick("stitching scenes");
    const concatVideoPath = join(tmp, "concat.mp4");
    await concatScenes(sceneVideoPaths, concatVideoPath);

    // 4. Generate caption PNG overlay (sharp, since drawtext isn't available).
    let captionPng: string | undefined;
    if (story.globalCaption.trim()) {
      tick("caption overlay");
      const png = await renderCaptionPng({ text: story.globalCaption.trim() });
      captionPng = join(tmp, "caption.png");
      await writeFile(captionPng, png);
    } else {
      step += 1;
    }

    // 5. Mux audio + (optional) caption overlay onto the concatenated video.
    tick("final mux");
    const finalPath = join(tmp, "final.mp4");
    await muxAudioAndCaption({
      videoPath: concatVideoPath,
      audioPath,
      captionPng,
      outputPath: finalPath,
    });

    // 6. Persist the final reel as a video asset and link it to the story.
    const assetId = nanoid(12);
    const persisted = await persistFromFile(finalPath, {
      key: `${inf.id}/stories/${story.id}.mp4`,
      ext: "mp4",
    });
    await db.insert(schema.assets).values({
      id: assetId,
      influencerId: inf.id,
      kind: "video",
      url: persisted.url,
      storageKey: persisted.key,
      meta: {
        storyId: story.id,
        title: story.title,
        sceneCount: story.scenes.length,
        mode,
      },
    });
    await db
      .update(schema.stories)
      .set({ status: "done", outputAssetId: assetId, error: null })
      .where(eq(schema.stories.id, story.id));

    args.onProgress?.(100, "done");
    return { assetId, url: persisted.url, sceneCount: story.scenes.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.stories)
      .set({ status: "error", error: msg })
      .where(eq(schema.stories.id, args.storyId));
    throw err;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function buildMotionPrompt(visualDirection: string) {
  const base = visualDirection.trim();
  const motionHints =
    "subtle natural motion: gentle head turn, slow blink, soft breathing, hair shifting in air, ambient camera drift, cinematic 24fps";
  return `${base}. ${motionHints}. avoid: rubbing hands, repetitive gestures, exaggerated facial expressions, morphing limbs.`;
}

async function materializeToDisk(url: string, destPath: string): Promise<void> {
  if (url.startsWith("file://")) {
    const src = fileURLToPath(url);
    const buf = await (await import("node:fs/promises")).readFile(src);
    await writeFile(destPath, buf);
    return;
  }
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
}

// Scale each scene to 1080x1920, normalize SAR, then concat. We re-encode
// rather than stream-copy because input clips can have different codecs,
// frame rates, and resolutions depending on the video model.
async function concatScenes(inputs: string[], outputPath: string): Promise<void> {
  const filterParts: string[] = [];
  inputs.forEach((_, i) => {
    filterParts.push(
      `[${i}:v]scale=w=if(gt(a\\,9/16)\\,-2\\,1080):h=if(gt(a\\,9/16)\\,1920\\,-2),crop=1080:1920,setsar=1,fps=30[v${i}]`,
    );
  });
  const concatList = inputs.map((_, i) => `[v${i}]`).join("");
  filterParts.push(`${concatList}concat=n=${inputs.length}:v=1:a=0[out]`);
  const filter = filterParts.join("; ");

  const args: string[] = ["-y"];
  inputs.forEach((p) => args.push("-i", p));
  args.push(
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    outputPath,
  );

  await runFfmpeg(args);
}

async function muxAudioAndCaption(opts: {
  videoPath: string;
  audioPath: string;
  captionPng?: string;
  outputPath: string;
}): Promise<void> {
  const args: string[] = ["-y", "-i", opts.videoPath, "-i", opts.audioPath];
  if (opts.captionPng) args.push("-i", opts.captionPng);

  if (opts.captionPng) {
    // [0:v] = video, [2:v] = caption PNG. Overlay PNG at top-left (PNG is
    // already sized to the full frame, so 0:0 places the caption where it
    // was rendered in the SVG).
    args.push("-filter_complex", "[0:v][2:v]overlay=0:0[v]");
    args.push("-map", "[v]", "-map", "1:a");
  } else {
    args.push("-map", "0:v", "-map", "1:a");
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    opts.outputPath,
  );

  await runFfmpeg(args);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin, args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.split("\n").slice(-5).join(" | ")}`)),
    );
    p.on("error", reject);
  });
}
