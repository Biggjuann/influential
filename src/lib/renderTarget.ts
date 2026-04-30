// Output-dimension math, shared by client (UI labels + estimates) and server
// (image-gen size + ffmpeg scale/crop + caption PlayRes). No "server-only"
// directive so this file is safe to import from React components.

export type AspectRatio = "auto" | "9:16" | "16:9" | "1:1" | "3:4" | "4:3" | "21:9";
export type Quality = "480p" | "720p" | "1080p";

export const ASPECT_OPTIONS: { id: AspectRatio; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Default vertical 9:16" },
  { id: "9:16", label: "9:16", hint: "Vertical (TikTok / Reels / Shorts)" },
  { id: "3:4", label: "3:4", hint: "Tall portrait" },
  { id: "1:1", label: "1:1", hint: "Square (Instagram feed)" },
  { id: "4:3", label: "4:3", hint: "Landscape portrait-ish" },
  { id: "16:9", label: "16:9", hint: "Landscape (YouTube)" },
  { id: "21:9", label: "21:9", hint: "Cinematic widescreen" },
];

export const QUALITY_OPTIONS: { id: Quality; label: string; shortDim: number }[] = [
  { id: "480p", label: "480p", shortDim: 480 },
  { id: "720p", label: "720p", shortDim: 720 },
  { id: "1080p", label: "1080p", shortDim: 1080 },
];

const QUALITY_SHORT: Record<Quality, number> = {
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
};

const ASPECT_RATIO_NUMERIC: Record<Exclude<AspectRatio, "auto">, [number, number]> = {
  "9:16": [9, 16],
  "16:9": [16, 9],
  "1:1": [1, 1],
  "3:4": [3, 4],
  "4:3": [4, 3],
  "21:9": [21, 9],
};

/**
 * Compute output {width, height} for a given aspect ratio + quality. Both
 * dimensions are even numbers (libx264 requires even). Quality picks the
 * SHORTER side of the frame; the longer side is derived from the aspect.
 */
export function dimensionsFor(
  aspect: AspectRatio,
  quality: Quality,
): { width: number; height: number } {
  const a = aspect === "auto" ? "9:16" : aspect;
  const [aw, ah] = ASPECT_RATIO_NUMERIC[a];
  const short = QUALITY_SHORT[quality];
  let width: number;
  let height: number;
  if (aw <= ah) {
    width = short;
    height = Math.round((short * ah) / aw);
  } else {
    height = short;
    width = Math.round((short * aw) / ah);
  }
  // libx264 needs even dimensions on both axes.
  width = width % 2 === 0 ? width : width - 1;
  height = height % 2 === 0 ? height : height - 1;
  return { width, height };
}

/** Map our AspectRatio enum onto fal's image-gen aspectRatio enum. */
export function imageGenAspect(aspect: AspectRatio): "9:16" | "1:1" | "16:9" {
  const a = aspect === "auto" ? "9:16" : aspect;
  if (a === "16:9" || a === "21:9" || a === "4:3") return "16:9";
  if (a === "1:1") return "1:1";
  return "9:16";
}

export const LENGTH_OPTIONS = [5, 8, 10, 12, 15] as const;
export type ClipLengthSec = (typeof LENGTH_OPTIONS)[number];
