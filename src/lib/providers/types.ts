export type ImageGenInput = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  faceReferenceUrl?: string;
  seed?: number;
  count?: number;
};

export type ImageGenOutput = {
  images: { url: string; width: number; height: number; seed: number }[];
};

export type VideoGenInput = {
  imageUrl: string;
  prompt: string;
  durationSec: 5 | 8;
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
