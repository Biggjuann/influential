import "server-only";
import { fal } from "@fal-ai/client";
import type {
  MediaProvider,
  ImageGenInput,
  ImageGenOutput,
  VideoGenInput,
  VideoGenOutput,
  TtsInput,
  TtsOutput,
  LipsyncInput,
  LipsyncOutput,
} from "./types";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

// Endpoint paths are configurable so you can swap models without redeploying
// when fal.ai publishes new versions, deprecates routes, or you want to test
// alternates (e.g. Kling vs Wan vs LTX for video).
const ENDPOINTS = {
  flux: process.env.FAL_ENDPOINT_FLUX ?? "fal-ai/flux/dev",
  fluxId: process.env.FAL_ENDPOINT_FLUX_ID ?? "fal-ai/flux-pulid",
  videoI2V: process.env.FAL_ENDPOINT_VIDEO_I2V ?? "fal-ai/wan-pro/image-to-video",
  ttsClone: process.env.FAL_ENDPOINT_TTS_CLONE ?? "fal-ai/f5-tts",
  ttsFallback: process.env.FAL_ENDPOINT_TTS_FALLBACK ?? "fal-ai/kokoro/american-english",
  lipsync: process.env.FAL_ENDPOINT_LIPSYNC ?? "fal-ai/latentsync",
};

// Surface fal's structured 422 / validation errors instead of swallowing them
// as a bare "Unprocessable Entity". When fal rejects an input it returns
// `{ detail: [{ loc, msg, type }] }` which we flatten into a readable message.
async function call<T>(endpoint: string, input: Record<string, unknown>): Promise<T> {
  try {
    const result = await (fal as unknown as {
      subscribe: (e: string, o: { input: Record<string, unknown> }) => Promise<{ data: T }>;
    }).subscribe(endpoint, { input });
    return result.data;
  } catch (err) {
    throw new Error(formatFalError(endpoint, err));
  }
}

function formatFalError(endpoint: string, err: unknown): string {
  if (!err || typeof err !== "object") return `fal ${endpoint}: ${String(err)}`;
  const e = err as { status?: number; body?: unknown; message?: string };

  let detail = "";
  if (e.body && typeof e.body === "object") {
    const b = e.body as { detail?: unknown; message?: string };
    if (Array.isArray(b.detail)) {
      detail = b.detail
        .map((d: { loc?: unknown[]; msg?: string }) => {
          const path = Array.isArray(d.loc) ? d.loc.join(".") : "";
          return `${path ? `${path}: ` : ""}${d.msg ?? ""}`;
        })
        .filter(Boolean)
        .join("; ");
    } else if (typeof b.detail === "string") {
      detail = b.detail;
    } else if (b.message) {
      detail = b.message;
    }
  }
  if (!detail) detail = e.message ?? "unknown error";
  return `fal ${endpoint} (${e.status ?? "?"}): ${detail}`;
}

const SIZES = {
  "9:16": { width: 768, height: 1344 },
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
} as const;

type FluxResult = {
  images: { url: string; width: number; height: number }[];
  seed: number;
};

async function falImage(input: ImageGenInput): Promise<ImageGenOutput> {
  const size = SIZES[input.aspectRatio ?? "9:16"];
  const count = input.count ?? 1;

  if (input.faceReferenceUrl) {
    const data = await call<FluxResult>(ENDPOINTS.fluxId, {
      prompt: input.prompt,
      reference_image_url: input.faceReferenceUrl,
      image_size: { width: size.width, height: size.height },
      num_images: count,
      seed: input.seed,
      negative_prompt: input.negativePrompt,
    });
    return { images: data.images.map((img) => ({ ...img, seed: data.seed })) };
  }

  const data = await call<FluxResult>(ENDPOINTS.flux, {
    prompt: input.prompt,
    image_size: { width: size.width, height: size.height },
    num_images: count,
    seed: input.seed,
    enable_safety_checker: false,
  });
  return { images: data.images.map((img) => ({ ...img, seed: data.seed })) };
}

async function falVideo(input: VideoGenInput): Promise<VideoGenOutput> {
  const data = await call<{ video: { url: string; width?: number; height?: number } }>(
    ENDPOINTS.videoI2V,
    {
      image_url: input.imageUrl,
      prompt: input.prompt,
    },
  );
  return {
    videoUrl: data.video.url,
    width: data.video.width ?? 720,
    height: data.video.height ?? 1280,
    durationSec: input.durationSec,
  };
}

async function falTts(input: TtsInput): Promise<TtsOutput> {
  if (input.voiceRefUrl) {
    const data = await call<{ audio_url: { url: string }; duration?: number }>(ENDPOINTS.ttsClone, {
      gen_text: input.text,
      ref_audio_url: input.voiceRefUrl,
      ref_text: "",
      model_type: "F5-TTS",
    });
    return { audioUrl: data.audio_url.url, durationSec: data.duration ?? 0 };
  }
  const data = await call<{ audio: { url: string; duration?: number } }>(ENDPOINTS.ttsFallback, {
    prompt: input.text,
    voice: "af_bella",
  });
  return { audioUrl: data.audio.url, durationSec: data.audio.duration ?? 0 };
}

async function falLipsync(input: LipsyncInput): Promise<LipsyncOutput> {
  const data = await call<{ video: { url: string } }>(ENDPOINTS.lipsync, {
    video_url: input.videoUrl,
    audio_url: input.audioUrl,
  });
  return { videoUrl: data.video.url };
}

export const falProvider: MediaProvider = {
  generateImage: falImage,
  generateVideo: falVideo,
  tts: falTts,
  lipsync: falLipsync,
};
