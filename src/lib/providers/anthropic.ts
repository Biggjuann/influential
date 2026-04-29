import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You design fictional AI influencers for short-form social video.
Output ONLY a single JSON object matching the requested schema. No prose, no markdown fences.
The persona must be a coherent, believable, brand-safe young adult (18+) creator.
The visualPrompt is the most important field: it must be a detailed, photorealistic Flux prompt
that locks in immutable physical traits (face shape, jawline, eye shape & color, skin tone,
hair color/length/style, build) so the same prompt produces a recognizably consistent person
across different scenes. Do not include scene/clothing/pose details in visualPrompt — those
vary per shot. Always end visualPrompt with: ", photorealistic, 35mm photo, soft natural light, sharp focus, skin texture detail".`;

export async function generatePersona(brief: { niche: string; vibe?: string; gender?: string }) {
  const c = getClient();
  if (!c) {
    return mockPersona(brief);
  }

  const userMsg = `Create an AI influencer persona for this brief:
- niche: ${brief.niche}
- vibe: ${brief.vibe ?? "(open)"}
- gender: ${brief.gender ?? "(open)"}

Return JSON with this exact shape:
{
  "name": string,
  "age": number (22-32),
  "ethnicity": string,
  "hair": string,
  "eyes": string,
  "build": string,
  "style": string,
  "backstory": string (2-3 sentences),
  "voiceDescription": string (tone, pace, accent),
  "contentPillars": string[] (3-5 items),
  "visualPrompt": string,
  "negativePrompt": string
}`;

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseJsonStrict(text);
}

export async function generateScript(args: {
  persona: { name: string; voiceDescription: string; contentPillars: string[] };
  topic: string;
  durationSec: number;
}) {
  const c = getClient();
  if (!c) return mockScript(args);

  const wordsTarget = Math.round(args.durationSec * 2.5);

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: `You write short-form vertical video scripts for TikTok. Output JSON only.`,
    messages: [
      {
        role: "user",
        content: `Write a ${args.durationSec}-second TikTok script for ${args.persona.name}.
Voice: ${args.persona.voiceDescription}
Content pillars: ${args.persona.contentPillars.join(", ")}
Topic: ${args.topic}
Target length: ~${wordsTarget} words. Punchy hook in the first 1.5 seconds.

Return JSON:
{
  "hook": string,
  "spokenLine": string (the FULL line to be voiced, including hook),
  "visualDirection": string (what we see — single subject, the influencer, in one continuous shot),
  "captionText": string (burned-in caption, can be different from spokenLine),
  "hashtags": string[] (5-8 tiktok hashtags, no # prefix)
}`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJsonStrict(text);
}

function parseJsonStrict(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function mockPersona(brief: { niche: string; vibe?: string; gender?: string }) {
  return {
    name: "Aria Vale",
    age: 24,
    ethnicity: "mixed European / East Asian",
    hair: "long wavy auburn",
    eyes: "warm hazel",
    build: "petite, athletic",
    style: "soft minimalist with vintage accents",
    backstory: `A ${brief.niche} creator who built her following by sharing honest behind-the-scenes moments. Based in Lisbon, formerly in NYC.`,
    voiceDescription: "warm, conversational, mid-pitched, very slight transatlantic accent, unhurried",
    contentPillars: [brief.niche, "morning routines", "honest reviews", "city life"],
    visualPrompt:
      "portrait of a 24-year-old woman, mixed European and East Asian features, oval face with high cheekbones, defined jawline, warm hazel almond eyes, long wavy auburn hair, fair skin with light freckles, petite athletic build, photorealistic, 35mm photo, soft natural light, sharp focus, skin texture detail",
    negativePrompt: "cartoon, anime, illustration, plastic skin, deformed, extra fingers, watermark, text",
  };
}

function mockScript(args: { topic: string; durationSec: number }) {
  return {
    hook: `wait — you didn't know about ${args.topic}?`,
    spokenLine: `Wait, you didn't know about ${args.topic}? Okay, here's the part nobody talks about. I tried it for thirty days and the difference was wild — I'll show you exactly what changed.`,
    visualDirection: "single subject, talking directly to camera, soft window light, slight handheld feel",
    captionText: `you didn't know about ${args.topic}?? 🤯`,
    hashtags: ["fyp", "foryou", "viral", "tiktokmademebuyit", args.topic.replace(/\s+/g, "")],
  };
}
