export type QualityMode = "draft" | "standard" | "premium";
export type ImageEngine = "face-lock" | "seedream" | "flux-pro" | "recraft";

export type ImageGenInput = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  faceReferenceUrl?: string;
  /** Optional second reference image — typically a product photo. When set
   * alongside faceReferenceUrl, the provider routes through a multi-image
   * conditioning model (Flux Kontext) so the influencer can be shown
   * holding/using the actual uploaded product, not a model hallucination. */
  productReferenceUrl?: string;
  seed?: number;
  count?: number;
  mode?: QualityMode;
  engine?: ImageEngine;
  idWeightOverride?: number;
};

export type ImageGenOutput = {
  images: { url: string; width: number; height: number; seed: number }[];
};

export type VideoGenInput = {
  imageUrl: string;
  prompt: string;
  /** Requested clip duration in seconds. Underlying models clamp to their
   * own caps (e.g. Wan 2.2 ~5-8s, Kling 1.6 5-10s, Kling 2 Master to 10s). */
  durationSec: number;
  mode?: QualityMode;
};

export type VideoGenOutput = {
  videoUrl: string;
  width: number;
  height: number;
  durationSec: number;
};

export type TtsInput = {
  text: string;
  voiceRefUrl?: string;
  voiceDescription?: string;
  /** Stock voice preset name (e.g. "Rachel"). Falls back to FAL_TTS_VOICE
   * env var, then "Rachel" hardcoded. Used when no voiceRefUrl clone. */
  voicePreset?: string;
};

export type TtsOutput = { audioUrl: string; durationSec: number };

export type LipsyncInput = { videoUrl: string; audioUrl: string };
export type LipsyncOutput = { videoUrl: string };

export interface MediaProvider {
  generateImage(input: ImageGenInput): Promise<ImageGenOutput>;
  generateVideo(input: VideoGenInput): Promise<VideoGenOutput>;
  tts(input: TtsInput): Promise<TtsOutput>;
  lipsync(input: LipsyncInput): Promise<LipsyncOutput>;
}
