import "server-only";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { persistFromBuffer } from "./storage";
import { toAbsoluteUrl } from "./publicUrl";

/**
 * Normalize a keyframe image to exactly the target dimensions so the
 * downstream image-to-video model gets something it can accept.
 *
 * Image generators sometimes return slightly off-shape outputs (Seedream
 * Edit, Flux Kontext multi, even plain Flux occasionally). Kling 1.6
 * rejects images with aspect ratio outside 0.4-2.5 with HTTP 422. This
 * helper fetches whatever URL we got, scale-to-cover crops to {w, h},
 * and re-uploads to our storage so the rest of the pipeline gets a
 * canonical URL pointing at a known-correct frame.
 *
 * Best-effort: returns the original URL if normalization can't run for
 * any reason — better to let the model surface its own error than to
 * fail the whole pipeline on a fetch hiccup.
 */
export async function normalizeKeyframe(args: {
  sourceUrl: string;
  width: number;
  height: number;
  influencerId: string;
}): Promise<string> {
  const fetchUrl = args.sourceUrl.startsWith("/api/assets/")
    ? toAbsoluteUrl(args.sourceUrl)
    : args.sourceUrl;

  let buf: Buffer;
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) return args.sourceUrl;
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return args.sourceUrl;
  }

  let normalized: Buffer;
  try {
    normalized = await sharp(buf)
      .resize(args.width, args.height, { fit: "cover", position: "centre" })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch (e) {
    console.warn("normalizeKeyframe sharp failed:", e);
    return args.sourceUrl;
  }

  try {
    const persisted = await persistFromBuffer(normalized, {
      key: `${args.influencerId}/keyframes/norm_${nanoid(8)}.jpg`,
      ext: "jpg",
    });
    // Return absolute since the next consumer is fal — they need to fetch it.
    return toAbsoluteUrl(persisted.url);
  } catch (e) {
    console.warn("normalizeKeyframe persist failed:", e);
    return args.sourceUrl;
  }
}
