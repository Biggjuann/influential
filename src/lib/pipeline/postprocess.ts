import "server-only";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { nanoid } from "nanoid";

const bin = ffmpegPath as unknown as string | null;
if (bin) ffmpeg.setFfmpegPath(bin);

const STORAGE_ROOT = process.env.STORAGE_DIR ?? "./data/assets";

// ffmpeg-static ships without libfreetype/libass, so drawtext is unavailable.
// Detect once at startup; when missing, we skip the caption burn step. The UI
// renders the caption as an overlay above the player either way. Install a
// full system ffmpeg if you want captions baked into the file itself.
const SUPPORTS_DRAWTEXT = (() => {
  if (!bin) return false;
  try {
    const out = execSync(`${bin} -hide_banner -filters 2>&1`, { encoding: "utf8" });
    return /\bdrawtext\b/.test(out);
  } catch {
    return false;
  }
})();

// Crop/scale to TikTok 1080x1920. Optionally burn caption text.
export async function burnCaptionsAndCrop(args: {
  inputPath: string;
  captionText: string;
  influencerId: string;
}): Promise<string> {
  const dir = join(STORAGE_ROOT, args.influencerId, "video-final");
  await mkdir(dir, { recursive: true });
  const outPath = join(dir, `${nanoid(12)}.mp4`);

  const filters = [
    "scale=w=if(gt(a\\,9/16)\\,-2\\,1080):h=if(gt(a\\,9/16)\\,1920\\,-2)",
    "crop=1080:1920",
  ];
  if (SUPPORTS_DRAWTEXT) {
    const text = sanitizeCaption(args.captionText);
    filters.push(
      `drawtext=text='${text}':fontcolor=white:fontsize=64:borderw=4:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.18:line_spacing=10`,
    );
  }

  return new Promise((resolve, reject) => {
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
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}

function sanitizeCaption(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\n/g, " ")
    .slice(0, 120);
}
