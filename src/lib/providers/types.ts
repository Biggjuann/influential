export type QualityMode = "draft" | "standard" | "premium";
export type ImageEngine = "face-lock" | "seedream" | "flux-pro" | "recraft";

export type ImageGenInput = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  faceReferenceUrl?: string;
  seed?: number;
  count?: number;
  mode?: QualityMode;
  engine?: ImageEngine;
  // Override PuLID id_weight for face-locked generations. Lower (0.6-0.8) =
  // scene rendering wins over face fidelity. Higher (0.9-1.0) = face is
  // pixel-locked but scene tokens can get crowded out.
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
