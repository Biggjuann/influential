import "server-only";
import { db, schema, ready } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegStaticPath from "ffmpeg-static";
import { getProvider } from "../providers";
import type { QualityMode } from "../providers/types";
import { persistFromFile } from "../storage";
import { toAbsoluteUrl } from "../publicUrl";
import { buildAss } from "../captionAss";
import { buildKeyframePrompt, buildKeyframeNegative, buildMotionPrompt } from "../promptStyle";
import type { Format } from "../formatPresets";
import {
  dimensionsFor,
  imageGenAspect,
  type AspectRatio,
  type Quality,
} from "../renderTarget";
import { normalizeKeyframe } from "../normalizeImage";
import type { StoryScene } from "../db/schema";

// Prefer system ffmpeg (libass + libfreetype + a real font library) over the
// bundled static binary, which lacks both. The runtime Docker image installs
// system ffmpeg + fonts; ffmpeg-static stays as a fallback for environments
// where the system binary isn't present (e.g. local dev on a fresh laptop).
const SYSTEM_FFMPEG = "/usr/bin/ffmpeg";
const SYSTEM_FFPROBE = "/usr/bin/ffprobe";
const ffmpegBin = existsSync(SYSTEM_FFMPEG)
  ? SYSTEM_FFMPEG
  : ((ffmpegStaticPath as unknown as string | null) ?? "ffmpeg");
const HAS_LIBASS = ffmpegBin === SYSTEM_FFMPEG;
const HAS_FFPROBE = existsSync(SYSTEM_FFPROBE);

// (prompt anchors / motion now come from formatPresets.ts via promptStyle.ts)

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
  const format: Format = ((story as { format?: string }).format as Format) ?? "cinematic";
  const aspectRatio: AspectRatio =
    ((story as { aspectRatio?: string }).aspectRatio as AspectRatio) ?? "9:16";
  const quality: Quality = ((story as { quality?: string }).quality as Quality) ?? "1080p";
  const target = dimensionsFor(aspectRatio, quality);
  const imgAspect = imageGenAspect(aspectRatio);

  // Product reference: when set, the story's detail shots use the product's
  // canonical image as the keyframe directly (skipping image gen entirely)
  // and subject shots fall back to the regular face-locked path.
  const productId = (story as { productId?: string | null }).productId ?? null;
  const product = productId
    ? (
        await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, productId))
          .limit(1)
      )[0] ?? null
    : null;
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

      const shotType = scene.shotType ?? "subject";

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
        tick(`scene ${i + 1} (${shotType}): using picked image`);
      } else if (
        product &&
        shotType === "detail" &&
        product.images &&
        product.images.length > 0
      ) {
        // Product detail shot: animate the actual product image directly,
        // skipping a fresh keyframe gen. This is the cornerstone of unboxing
        // / product review / try-on flows — the product needs to look like
        // the real product, not Flux's interpretation of the prompt.
        keyframeUrl = toAbsoluteUrl(product.images[0]);
        tick(`scene ${i + 1} (detail / product): using ${product.name}`);
      } else {
        tick(`scene ${i + 1} (${shotType}/${format}): keyframe`);
        const isSubject = shotType === "subject";
        if (isSubject && !canon) {
          throw new Error("subject scene needs influencer canonical face — pick one first");
        }
        const useMultiRef =
          isSubject && product && product.images && product.images.length > 0;
        const kf = await provider.generateImage({
          prompt: buildKeyframePrompt({
            visualDirection: scene.visualDirection,
            format,
            shotType,
            characterPrompt: isSubject ? inf.persona.visualPrompt : undefined,
            withProduct:
              useMultiRef && product
                ? { name: product.name, description: product.description }
                : undefined,
          }),
          negativePrompt: buildKeyframeNegative({
            format,
            shotType,
            personaNegative: isSubject ? inf.persona.negativePrompt : undefined,
          }),
          aspectRatio: imgAspect,
          faceReferenceUrl: isSubject && canon ? toAbsoluteUrl(canon.url) : undefined,
          // When a product is attached AND this is a subject shot, also pass
          // the product image so the multi-ref model puts the influencer
          // with the ACTUAL uploaded product in frame (vs Flux hallucinating
          // a generic version of "tennis racket" from the prompt text).
          productReferenceUrl:
            isSubject && product && product.images?.[0]
              ? toAbsoluteUrl(product.images[0])
              : undefined,
          count: 1,
          mode,
          idWeightOverride: isSubject ? 0.7 : undefined,
        });
        keyframeUrl = kf.images[0].url;
      }

      // Normalize the keyframe to exactly target dimensions before handing
      // to the I2V model. Image generators (Seedream Edit, Flux Kontext)
      // can return slightly off-shape outputs and Kling rejects anything
      // outside a 0.4-2.5 aspect ratio with HTTP 422.
      keyframeUrl = await normalizeKeyframe({
        sourceUrl: keyframeUrl,
        width: target.width,
        height: target.height,
        influencerId: inf.id,
      });

      tick(`scene ${i + 1}: animating`);
      const vid = await provider.generateVideo({
        imageUrl: keyframeUrl,
        prompt: buildMotionPrompt({
          visualDirection: scene.visualDirection,
          format,
          shotType,
        }),
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
      voicePreset: inf.persona.voicePreset,
    });
    const audioPath = join(tmp, "voice.wav");
    await materializeToDisk(tts.audioUrl, audioPath);

    // 3. Concat + scale all scene clips into one silent reel at the chosen
    //    aspect ratio + quality.
    tick("stitching scenes");
    const concatVideoPath = join(tmp, "concat.mp4");
    await concatScenes(sceneVideoPaths, concatVideoPath, target);

    // 3a. Length match. If the voiceover is longer than the stitched video
    //     we hold the final frame so the voice never gets cut off mid-word
    //     (standard editing move). If shorter, the natural -shortest mux is
    //     the right behaviour — video plays out, audio ends in silence.
    const sceneTotalSec = story.scenes.reduce((s, x) => s + x.durationSec, 0);
    let videoForMux = concatVideoPath;
    let finalDurationSec = sceneTotalSec;
    if (HAS_FFPROBE) {
      try {
        const audioDur = await probeDuration(audioPath);
        if (audioDur > sceneTotalSec + 0.3) {
          const padSec = +(audioDur - sceneTotalSec).toFixed(2);
          const paddedPath = join(tmp, "concat-padded.mp4");
          await runFfmpeg([
            "-y",
            "-i",
            concatVideoPath,
            "-vf",
            `tpad=stop_mode=clone:stop_duration=${padSec}`,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-an",
            paddedPath,
          ]);
          videoForMux = paddedPath;
          finalDurationSec = audioDur;
        }
      } catch {
        // probing is best-effort — if it fails we just use the unpadded video
      }
    }

    // 4. Generate ASS subtitle for caption overlay (libass, broadcast-grade).
    //    Caption duration matches the FINAL video so the burn-in stays
    //    on-screen through any padded last-frame hold.
    let assPath: string | undefined;
    if (story.globalCaption.trim()) {
      tick("caption overlay");
      if (HAS_LIBASS) {
        const ass = buildAss({
          text: story.globalCaption.trim(),
          style: inf.persona.captionStyle ?? undefined,
          durationSec: finalDurationSec,
          videoW: target.width,
          videoH: target.height,
        });
        assPath = join(tmp, "caption.ass");
        await writeFile(assPath, ass);
      }
    } else {
      step += 1;
    }

    // 5. Mux audio + (optional) caption subtitle onto the concatenated video.
    tick("final mux");
    const finalPath = join(tmp, "final.mp4");
    await muxAudioAndCaption({
      videoPath: videoForMux,
      audioPath,
      assPath,
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

// Scale each scene to the target dimensions, normalize SAR, then concat.
// Each input clip might have a different aspect ratio than our target — we
// scale-to-cover then crop, so the frame is filled without letterboxing.
async function concatScenes(
  inputs: string[],
  outputPath: string,
  target: { width: number; height: number },
): Promise<void> {
  const { width, height } = target;
  const targetAspect = width / height;

  const filterParts: string[] = [];
  inputs.forEach((_, i) => {
    // Scale-to-cover: if input aspect > target, scale by height; else scale
    // by width. Then center-crop to the exact target box.
    filterParts.push(
      `[${i}:v]scale=w=if(gt(a\\,${targetAspect})\\,-2\\,${width}):h=if(gt(a\\,${targetAspect})\\,${height}\\,-2),crop=${width}:${height},setsar=1,fps=30[v${i}]`,
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
  assPath?: string;
  outputPath: string;
}): Promise<void> {
  const args: string[] = ["-y", "-i", opts.videoPath, "-i", opts.audioPath];

  if (opts.assPath) {
    // libass subtitle burn-in. The path needs careful escaping inside the
    // filtergraph (colons and backslashes are filter separators in ffmpeg's
    // bizarre filter syntax). Sticking the .ass in the same tmp dir and
    // referencing it by absolute path works because tmp paths don't contain
    // characters that need filter-level escaping; we still escape `:` to be
    // robust on macOS/Windows-style paths.
    const safe = opts.assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    args.push("-vf", `subtitles=${safe}`, "-map", "0:v", "-map", "1:a");
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

function probeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(SYSTEM_FFPROBE, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err}`));
      const dur = parseFloat(out.trim());
      if (!Number.isFinite(dur)) return reject(new Error(`ffprobe non-numeric: ${out}`));
      resolve(dur);
    });
    p.on("error", reject);
  });
}
