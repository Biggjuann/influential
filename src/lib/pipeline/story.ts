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

// Same anchors as the gallery generator — keep behaviour consistent so a
// scene rendered via the studio looks like one rendered via a story beat.
const PHOTOREAL_PREFIX =
  "cinematic photograph, photorealistic, 35mm film, professional editorial photography, sharp focus, natural skin texture, detailed";
const HARD_NEGATIVE =
  "cartoon, anime, illustration, 3d render, cgi, plastic skin, deformed face, extra fingers, lowres, watermark, text, stock photo, oversaturated, bad anatomy";
// Pushes the model away from rendering people in scenery / detail shots.
// Travel content is mostly B-roll, so most scenes shouldn't have the
// influencer (or any human) in frame.
const NO_PEOPLE_NEGATIVE =
  "people, person, human, model, portrait, face, character, crowd";

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
      } else {
        tick(`scene ${i + 1} (${shotType}): keyframe`);
        // Subject shots include character traits + face reference. Scenery
        // and detail shots SKIP the character entirely so the model can
        // actually render landscapes / cutaways without dragging a face into
        // the frame — that's the cornerstone of travel-creator B-roll.
        const isSubject = shotType === "subject";
        if (isSubject && !canon) {
          throw new Error("subject scene needs influencer canonical face — pick one first");
        }

        const promptParts = [PHOTOREAL_PREFIX, scene.visualDirection];
        if (isSubject) promptParts.push(inf.persona.visualPrompt);

        const negativeParts = [HARD_NEGATIVE];
        if (isSubject && inf.persona.negativePrompt) {
          negativeParts.unshift(inf.persona.negativePrompt);
        }
        if (!isSubject) negativeParts.push(NO_PEOPLE_NEGATIVE);

        const kf = await provider.generateImage({
          prompt: promptParts.filter(Boolean).join(", "),
          negativePrompt: negativeParts.join(", "),
          aspectRatio: "9:16",
          faceReferenceUrl: isSubject && canon ? toAbsoluteUrl(canon.url) : undefined,
          count: 1,
          mode,
          // Subject shots: scene-fidelity-leaning identity weight (0.7).
          // Scenery/detail: no PuLID at all — engine is plain Flux.
          idWeightOverride: isSubject ? 0.7 : undefined,
        });
        keyframeUrl = kf.images[0].url;
      }

      tick(`scene ${i + 1}: animating`);
      const vid = await provider.generateVideo({
        imageUrl: keyframeUrl,
        prompt: buildMotionPrompt(scene.visualDirection, shotType),
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

function buildMotionPrompt(visualDirection: string, shotType: "subject" | "scenery" | "detail" = "subject") {
  const base = visualDirection.trim();
  const motion =
    shotType === "subject"
      ? "subtle natural motion: gentle head turn, slow blink, soft breathing, hair shifting in air, ambient camera drift, cinematic 24fps"
      : shotType === "scenery"
        ? "slow cinematic camera move: gentle pan or push-in, atmospheric parallax, light shifting through clouds or foliage, ambient environmental motion (water, wind, distant traffic), 24fps"
        : "macro focus pull, slight handheld breathing, gentle subject motion, 24fps";
  const avoid =
    shotType === "subject"
      ? "rubbing hands, repetitive gestures, exaggerated facial expressions, morphing limbs"
      : shotType === "scenery"
        ? "people walking into frame, generic stock motion, jittery camera, unnatural zooms"
        : "morphing object shape, jittery focus, talking heads";
  return `${base}. ${motion}. avoid: ${avoid}.`;
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
