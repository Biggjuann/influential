import "server-only";
import ffmpegStaticPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAss } from "../captionAss";
import type { CaptionStyleConfig } from "../db/schema";
import { dimensionsFor, type AspectRatio, type Quality } from "../renderTarget";

// Prefer system ffmpeg (libass + real fonts) over the bundled static binary.
const SYSTEM_FFMPEG = "/usr/bin/ffmpeg";
const ffmpegBin = existsSync(SYSTEM_FFMPEG)
  ? SYSTEM_FFMPEG
  : ((ffmpegStaticPath as unknown as string | null) ?? null);
if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin);
const HAS_LIBASS = ffmpegBin === SYSTEM_FFMPEG;

/**
 * Crop/scale to the chosen output box and optionally burn a caption via libass.
 * Defaults to 9:16 / 1080p (TikTok / Reels) when no aspect/quality given.
 */
export async function burnCaptionsAndCrop(args: {
  inputPath: string;
  outputPath: string;
  captionText: string;
  captionStyle?: CaptionStyleConfig;
  durationSec?: number;
  aspectRatio?: AspectRatio;
  quality?: Quality;
}): Promise<void> {
  const { width, height } = dimensionsFor(
    args.aspectRatio ?? "9:16",
    args.quality ?? "1080p",
  );
  const targetAspect = width / height;
  const filters: string[] = [
    `scale=w=if(gt(a\\,${targetAspect})\\,-2\\,${width}):h=if(gt(a\\,${targetAspect})\\,${height}\\,-2)`,
    `crop=${width}:${height}`,
  ];

  let cleanupDir: string | null = null;
  if (HAS_LIBASS && args.captionText.trim()) {
    cleanupDir = mkdtempSync(join(tmpdir(), "cap-"));
    const assPath = join(cleanupDir, "caption.ass");
    writeFileSync(
      assPath,
      buildAss({
        text: args.captionText.trim(),
        style: args.captionStyle,
        durationSec: args.durationSec ?? 30,
        videoW: width,
        videoH: height,
      }),
    );
    const safe = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    filters.push(`subtitles=${safe}`);
  }

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(args.inputPath)
        .videoFilters(filters)
        .outputOptions([
          "-c:v libx264",
          "-preset veryfast",
          "-crf 20",
          "-pix_fmt yuv420p",
          "-c:a aac",
          "-b:a 128k",
          "-movflags +faststart",
        ])
        .save(args.outputPath)
        .on("end", () => resolve())
        .on("error", reject);
    });
  } finally {
    if (cleanupDir) rmSync(cleanupDir, { recursive: true, force: true });
  }
}
