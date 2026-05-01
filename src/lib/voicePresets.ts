// Curated voice presets verified to resolve on fal-ai/elevenlabs/tts/turbo-v2.5.
// These are the names ElevenLabs's stock library exposes via fal — the voice
// list rotates occasionally so we keep this conservative.

export type VoicePreset = {
  id: string;
  label: string;
  description: string;
  gender: "f" | "m" | "n";
};

export const VOICE_PRESETS: VoicePreset[] = [
  // Female voices
  { id: "Rachel", label: "Rachel", description: "Warm conversational, mid-pitched American female. Default.", gender: "f" },
  { id: "Aria", label: "Aria", description: "Expressive American female, podcaster energy.", gender: "f" },
  { id: "Sarah", label: "Sarah", description: "Soft, intimate American female.", gender: "f" },
  { id: "Charlotte", label: "Charlotte", description: "Young British female, slightly playful.", gender: "f" },
  { id: "Laura", label: "Laura", description: "Confident American female, upbeat.", gender: "f" },
  { id: "Lily", label: "Lily", description: "Gentle British female.", gender: "f" },
  { id: "Matilda", label: "Matilda", description: "Friendly American female, story-time vibe.", gender: "f" },
  { id: "Alice", label: "Alice", description: "Calm British female.", gender: "f" },

  // Male voices
  { id: "Adam", label: "Adam", description: "Deep American male, narration energy.", gender: "m" },
  { id: "Antoni", label: "Antoni", description: "Warm American male, conversational.", gender: "m" },
  { id: "Brian", label: "Brian", description: "Deep American male, talk-show host energy.", gender: "m" },
  { id: "Drew", label: "Drew", description: "Well-rounded American male.", gender: "m" },
  { id: "George", label: "George", description: "Mature British male.", gender: "m" },
  { id: "Liam", label: "Liam", description: "Articulate American male, slightly young.", gender: "m" },
  { id: "Daniel", label: "Daniel", description: "British male, news-anchor formal.", gender: "m" },
  { id: "Will", label: "Will", description: "Casual American male.", gender: "m" },
];

export const DEFAULT_VOICE = "Rachel";
