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

// Endpoints are configurable per quality mode. Costs as of late 2025:
//   draft    ~$0.05/clip — Flux schnell + LTX-Video, fast iteration
//   standard ~$0.20/clip — Flux dev + Kling 1.6 standard (default)
//   premium  ~$0.40/clip — Flux dev + Wan-pro, slower but highest fidelity
const ENDPOINTS = {
  flux: {
    draft: process.env.FAL_ENDPOINT_FLUX_DRAFT ?? "fal-ai/flux/schnell",
    standard: process.env.FAL_ENDPOINT_FLUX ?? "fal-ai/flux/dev",
    premium: process.env.FAL_ENDPOINT_FLUX_PREMIUM ?? "fal-ai/flux/dev",
  },
  fluxId: process.env.FAL_ENDPOINT_FLUX_ID ?? "fal-ai/flux-pulid",
  // Multi-image conditioning for "influencer holding/using the actual
  // product". Takes both the canonical face image and the product image
  // as references in one call. Seedream 4 Edit is the most reliable
  // multi-ref endpoint on fal (accepts up to 5 image_urls); override with
  // FAL_ENDPOINT_MULTI_REF for Flux Kontext / Nano Banana / Qwen Edit etc.
  multiRef:
    process.env.FAL_ENDPOINT_MULTI_REF ?? "fal-ai/bytedance/seedream/v4/edit",
  // Alternative engines without face-locking — much better at clothing
  // graphics, text on objects, and overall photorealism. Tradeoff: face will
  // resemble the visualPrompt but not be pixel-locked to canonical.
  seedream: process.env.FAL_ENDPOINT_SEEDREAM ?? "fal-ai/bytedance/seedream/v4/text-to-image",
  fluxPro: process.env.FAL_ENDPOINT_FLUX_PRO ?? "fal-ai/flux-pro/v1.1-ultra",
  recraft: process.env.FAL_ENDPOINT_RECRAFT ?? "fal-ai/recraft-v3",
  videoI2V: {
    draft: process.env.FAL_ENDPOINT_VIDEO_I2V_DRAFT ?? "fal-ai/ltx-video-v095/image-to-video",
    standard:
      process.env.FAL_ENDPOINT_VIDEO_I2V ?? "fal-ai/kling-video/v1.6/standard/image-to-video",
    premium: process.env.FAL_ENDPOINT_VIDEO_I2V_PREMIUM ?? "fal-ai/wan-pro/image-to-video",
  },
  ttsClone: process.env.FAL_ENDPOINT_TTS_CLONE ?? "fal-ai/f5-tts",
  // ElevenLabs Turbo is the most natural-sounding default available on fal.
  // Override via FAL_ENDPOINT_TTS_FALLBACK if you want a different model
  // (fal-ai/playai/tts/v3, fal-ai/kokoro/american-english, etc).
  ttsFallback: process.env.FAL_ENDPOINT_TTS_FALLBACK ?? "fal-ai/elevenlabs/tts/turbo-v2.5",
  lipsync: process.env.FAL_ENDPOINT_LIPSYNC ?? "fal-ai/latentsync",
};

// Per-step timeout so a stuck fal request fails loud instead of hanging
// forever. Default 10 min — Kling 1.6 typically finishes in <90s, but fal's
// queue can occasionally back up and we want a generous ceiling.
const STEP_TIMEOUT_MS = Number(process.env.FAL_TIMEOUT_MS ?? 10 * 60 * 1000);

// Surface fal's structured 422 / validation errors instead of swallowing them
// as a bare "Unprocessable Entity". When fal rejects an input it returns
// `{ detail: [{ loc, msg, type }] }` which we flatten into a readable message.
async function call<T>(endpoint: string, input: Record<string, unknown>): Promise<T> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${Math.round(STEP_TIMEOUT_MS / 1000)}s`)),
      STEP_TIMEOUT_MS,
    );
  });
  try {
    const subscribe = (fal as unknown as {
      subscribe: (e: string, o: { input: Record<string, unknown> }) => Promise<{ data: T }>;
    })
      .subscribe(endpoint, { input })
      .then((r) => r.data);
    return await Promise.race([subscribe, timeout]);
  } catch (err) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    throw new Error(`${formatFalError(endpoint, err)} [after ${elapsed}s]`);
  } finally {
    if (timer) clearTimeout(timer);
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
  const mode = input.mode ?? "standard";
  const engine = input.engine ?? "face-lock";

  // Engine selection. "face-lock" is the default Flux+PuLID identity lock;
  // the others are higher-fidelity general-purpose models that don't preserve
  // identity pixel-perfectly but render clothing graphics + photorealism much
  // better than Flux. We skip PuLID for those.
  if (engine === "seedream") {
    const data = await call<{ images: { url: string; width?: number; height?: number }[]; seed?: number }>(
      ENDPOINTS.seedream,
      {
        prompt: input.prompt,
        image_size: { width: size.width, height: size.height },
        num_images: count,
        seed: input.seed,
      },
    );
    return {
      images: data.images.map((img) => ({
        url: img.url,
        width: img.width ?? size.width,
        height: img.height ?? size.height,
        seed: data.seed ?? 0,
      })),
    };
  }

  if (engine === "flux-pro") {
    const data = await call<{ images: { url: string; width?: number; height?: number }[]; seed?: number }>(
      ENDPOINTS.fluxPro,
      {
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio === "9:16" ? "9:16" : input.aspectRatio === "16:9" ? "16:9" : "1:1",
        num_images: count,
        seed: input.seed,
      },
    );
    return {
      images: data.images.map((img) => ({
        url: img.url,
        width: img.width ?? size.width,
        height: img.height ?? size.height,
        seed: data.seed ?? 0,
      })),
    };
  }

  if (engine === "recraft") {
    const data = await call<{ images: { url: string }[] }>(ENDPOINTS.recraft, {
      prompt: input.prompt,
      image_size: { width: size.width, height: size.height },
      style: "realistic_image",
    });
    return {
      images: data.images.map((img) => ({
        url: img.url,
        width: size.width,
        height: size.height,
        seed: input.seed ?? 0,
      })),
    };
  }

  // Multi-image conditioning: both face + product references are present.
  // Seedream 4 Edit (default) takes a list of reference images and a prompt
  // describing how they should be combined. Output composites them into a
  // believable shot of the influencer using the actual uploaded product.
  // Both image_size (Seedream/Flux Kontext) and aspect_ratio (some forks)
  // are sent so endpoint swaps don't require pipeline changes.
  if (input.faceReferenceUrl && input.productReferenceUrl) {
    const data = await call<FluxResult>(ENDPOINTS.multiRef, {
      prompt: input.prompt,
      image_urls: [input.faceReferenceUrl, input.productReferenceUrl],
      image_size: { width: size.width, height: size.height },
      aspect_ratio: input.aspectRatio ?? "9:16",
      num_images: count,
      seed: input.seed,
    });
    return { images: data.images.map((img) => ({ ...img, seed: data.seed })) };
  }

  // Default: face-lock via Flux + PuLID (only when we have a reference).
  // PuLID is the most expensive image step, so draft mode falls through to
  // plain Flux schnell when no reference is provided OR draft is selected.
  const useFaceLock = mode !== "draft" && !!input.faceReferenceUrl;
  if (useFaceLock) {
    const idWeight = input.idWeightOverride ?? Number(process.env.FAL_PULID_ID_WEIGHT ?? 0.9);
    const data = await call<FluxResult>(ENDPOINTS.fluxId, {
      prompt: input.prompt,
      reference_image_url: input.faceReferenceUrl,
      image_size: { width: size.width, height: size.height },
      num_images: count,
      seed: input.seed,
      negative_prompt: input.negativePrompt,
      id_weight: idWeight,
    });
    return { images: data.images.map((img) => ({ ...img, seed: data.seed })) };
  }

  const data = await call<FluxResult>(ENDPOINTS.flux[mode], {
    prompt: input.prompt,
    image_size: { width: size.width, height: size.height },
    num_images: count,
    seed: input.seed,
    enable_safety_checker: false,
  });
  return { images: data.images.map((img) => ({ ...img, seed: data.seed })) };
}

async function falVideo(input: VideoGenInput): Promise<VideoGenOutput> {
  const mode = input.mode ?? "standard";
  const data = await call<{ video: { url: string; width?: number; height?: number } }>(
    ENDPOINTS.videoI2V[mode],
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
  // Fallback: route to whichever endpoint is configured. We send the broadest
  // possible param set since different TTS models on fal use different keys
  // (text vs prompt, voice id vs preset name) — extra fields are ignored by
  // each model's pydantic validator. Response shape can also vary.
  const voice = process.env.FAL_TTS_VOICE ?? "Rachel";
  const data = await call<{
    audio?: { url: string; duration?: number };
    audio_url?: string | { url: string };
  }>(ENDPOINTS.ttsFallback, {
    text: input.text,
    prompt: input.text,
    voice,
  });
  const url =
    data.audio?.url ??
    (typeof data.audio_url === "string" ? data.audio_url : data.audio_url?.url);
  if (!url) throw new Error(`tts response missing audio url: ${JSON.stringify(data).slice(0, 200)}`);
  return { audioUrl: url, durationSec: data.audio?.duration ?? 0 };
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
