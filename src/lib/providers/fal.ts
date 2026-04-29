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

// fal's typed endpoints lag the actual API surface. We treat each call as
// `(endpoint, input) -> data` and cast the response shape — gives us forward
// compatibility when fal adds new model endpoints we want to use.
async function call<T>(endpoint: string, input: Record<string, unknown>): Promise<T> {
  const result = await (fal as unknown as {
    subscribe: (e: string, o: { input: Record<string, unknown> }) => Promise<{ data: T }>;
  }).subscribe(endpoint, { input });
  return result.data;
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

// Identity-preserving image gen: Flux + PuLID for face consistency.
// Falls back to plain Flux when no reference image is provided.
async function falImage(input: ImageGenInput): Promise<ImageGenOutput> {
  const size = SIZES[input.aspectRatio ?? "9:16"];
  const count = input.count ?? 1;

  if (input.faceReferenceUrl) {
    const data = await call<FluxResult>("fal-ai/flux-pulid", {
      prompt: input.prompt,
      reference_image_url: input.faceReferenceUrl,
      image_size: { width: size.width, height: size.height },
      num_images: count,
      seed: input.seed,
      negative_prompt: input.negativePrompt,
      true_cfg: 1.5,
      id_weight: 1.0,
    });
    return { images: data.images.map((img) => ({ ...img, seed: data.seed })) };
  }

  const data = await call<FluxResult>("fal-ai/flux/dev", {
    prompt: input.prompt,
    image_size: { width: size.width, height: size.height },
    num_images: count,
    seed: input.seed,
    enable_safety_checker: false,
  });
  return { images: data.images.map((img) => ({ ...img, seed: data.seed })) };
}

// Image-to-video with Wan 2.2 — best open model for human-centric short-form.
async function falVideo(input: VideoGenInput): Promise<VideoGenOutput> {
  const data = await call<{ video: { url: string; width?: number; height?: number } }>(
    "fal-ai/wan/v2.2-a14b/image-to-video",
    {
      image_url: input.imageUrl,
      prompt: input.prompt,
      num_frames: input.durationSec === 5 ? 81 : 121,
      frames_per_second: 16,
      resolution: "720p",
    },
  );
  return {
    videoUrl: data.video.url,
    width: data.video.width ?? 720,
    height: data.video.height ?? 1280,
    durationSec: input.durationSec,
  };
}

// F5-TTS — zero-shot voice cloning from a reference clip.
async function falTts(input: TtsInput): Promise<TtsOutput> {
  if (input.voiceRefUrl) {
    const data = await call<{ audio_url: { url: string }; duration?: number }>("fal-ai/f5-tts", {
      gen_text: input.text,
      ref_audio_url: input.voiceRefUrl,
      ref_text: "",
      model_type: "F5-TTS",
    });
    return { audioUrl: data.audio_url.url, durationSec: data.duration ?? 0 };
  }
  // No voice clone available — use Kokoro for natural narration.
  const data = await call<{ audio: { url: string; duration?: number } }>(
    "fal-ai/kokoro/american-english",
    { prompt: input.text, voice: "af_bella" },
  );
  return { audioUrl: data.audio.url, durationSec: data.audio.duration ?? 0 };
}

// LatentSync — drives lips from any audio onto any face video.
async function falLipsync(input: LipsyncInput): Promise<LipsyncOutput> {
  const data = await call<{ video: { url: string } }>("fal-ai/latentsync", {
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
