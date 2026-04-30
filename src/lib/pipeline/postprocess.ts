import "server-only";
import ffmpegStaticPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAss } from "../captionAss";
import type { CaptionStyleConfig } from "../db/schema";

// Prefer system ffmpeg (libass + real fonts) over the bundled static binary.
const SYSTEM_FFMPEG = "/usr/bin/ffmpeg";
const ffmpegBin = existsSync(SYSTEM_FFMPEG)
  ? SYSTEM_FFMPEG
  : ((ffmpegStaticPath as unknown as string | null) ?? null);
if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin);
const HAS_LIBASS = ffmpegBin === SYSTEM_FFMPEG;

/**
 * Crop/scale to TikTok 1080x1920. Optionally burn a caption via libass.
 * Style is honored when libass is available (system ffmpeg); otherwise the
 * caption is skipped (the UI still shows it as an overlay above the player).
 */
export async function burnCaptionsAndCrop(args: {
  inputPath: string;
  outputPath: string;
  captionText: string;
  captionStyle?: CaptionStyleConfig;
  durationSec?: number;
}): Promise<void> {
  const filters: string[] = [
    "scale=w=if(gt(a\\,9/16)\\,-2\\,1080):h=if(gt(a\\,9/16)\\,1920\\,-2)",
    "crop=1080:1920",
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
