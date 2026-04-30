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
    system: `You write short-form vertical video scripts for TikTok in the voice of a specific creator. Output JSON only, no preamble or markdown.

Hard rules — break these and the output is unusable:
- Do NOT use "wait, you didn't know", "POV:", "the part nobody talks about", "I tried it for X days", "you'll never believe", or any other interchangeable AI-influencer hook. They scream slop.
- Do NOT manufacture fake transformations, fake stats, fake "everyone's doing this" claims.
- Write like a real person describing a real moment, not like a marketing bot.

What "good" looks like for this format:
- Opens mid-thought, like the camera caught them in the middle of doing something. Not a hook, an observation.
- Uses contractions, micro-pauses, the creator's actual voice quirks from their voiceDescription.
- Has one specific, tangible detail (a place, a price, a brand, a sensation) — vague is sloppy, specific is alive.
- Ends with a beat (a question, an aside, a quiet observation) — never a CTA like "follow for more".

The visualDirection is what we send to an image-to-video model (Kling/Wan) — be CINEMATIC and SPECIFIC: framing, lighting, subject's micro-action, mood. "Single subject talking to camera" is dead on arrival. "Mid-laugh, hand running through hair, late afternoon sun through a window, slight shift in weight" actually animates.`,
    messages: [
      {
        role: "user",
        content: `Write a ${args.durationSec}-second TikTok script for ${args.persona.name}.
Voice: ${args.persona.voiceDescription}
Content pillars: ${args.persona.contentPillars.join(", ")}
Topic: ${args.topic}
Target spoken length: ~${wordsTarget} words.

Return JSON:
{
  "hook": string (3-6 words, internal label only),
  "spokenLine": string (the FULL spoken line in their voice — no AI-influencer cliches),
  "visualDirection": string (cinematic, specific framing + lighting + micro-action),
  "captionText": string (≤ 50 chars, lowercase preferred, can be different from spoken),
  "hashtags": string[] (5-8 lowercase, no # prefix, mix broad + niche-specific)
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

// Plans a sequential N-beat reel from a single topic. Each beat advances the
// micro-narrative (e.g. walking → buying → biting) and the spoken lines join
// into ONE continuous voiceover, so the final stitched reel reads as one
// moment unfolding rather than three takes of the same thing.
export async function generateSequentialBeats(args: {
  persona: { name: string; voiceDescription: string; contentPillars: string[] };
  topic: string;
  beatCount: number;
  durationSecPerBeat: number;
}) {
  const c = getClient();
  if (!c) return mockBeats(args);

  const wordsPerBeat = Math.round(args.durationSecPerBeat * 2.3);

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `You plan a short vertical TikTok reel as a SEQUENCE of beats — discrete cinematic moments that move a tiny narrative forward.

CRITICAL: each visualDirection becomes the prompt sent to an image-to-video model. The model can only render what you literally describe. If the topic mentions a place, a brand, a prop, an action — those exact things must appear in EVERY beat's visualDirection where relevant. Generic descriptions like "a person walking in soft light" produce videos with nothing to do with the topic.

Hard rules:
- Each visualDirection MUST reference the specific topic elements (location, prop, action, time of day) by name. "approaching the Eiffel Tower's iron base", not "approaching a tower".
- Each visualDirection should be a SHOT description: framing (wide / medium / close), lens (35mm / 85mm / handheld), lighting (golden hour / overcast / neon), micro-action (mid-laugh, hand brushing hair, looking up).
- The fullScript is ONE continuous spoken take — written like a real person talking, not a marketing template. No "wait you didn't know about", "POV:", "I tried it for X days". Use contractions, micro-pauses, observational specifics.
- The arc: 3 beats = setup → development → payoff. 5 beats = setup → escalate → midpoint → escalate → resolve.

Output JSON only, no markdown fences.`,
    messages: [
      {
        role: "user",
        content: `Plan ${args.beatCount} sequential beats for ${args.persona.name}.
Voice: ${args.persona.voiceDescription}
Content pillars: ${args.persona.contentPillars.join(", ")}
Topic: ${args.topic}
Each beat is ${args.durationSecPerBeat}s. Voiceover: ~${wordsPerBeat * args.beatCount} words total spread across the beats.

Return JSON:
{
  "title": string (3-6 words, internal),
  "globalCaption": string (≤ 50 chars, lowercase preferred — burned across the whole reel),
  "fullScript": string (the FULL continuous spoken voiceover joining all beats — naturally written, not chopped),
  "beats": [
    {
      "visualDirection": string (cinematic shot description for THIS moment, MUST reference the topic's specifics by name),
      "spokenChunk": string (which slice of the script lands during this beat — informational, not used for separate TTS)
    }
    // ... beatCount entries
  ],
  "hashtags": string[] (5-8 lowercase, no #)
}

Example for topic "walk to the Eiffel Tower":
{
  "title": "eiffel walk",
  "globalCaption": "first time seeing it up close",
  "fullScript": "okay so i'm finally doing this. i've been in paris four days and somehow kept putting it off, like it was too obvious or something. but the light is doing this thing right now and. yeah. it's worth it.",
  "beats": [
    {"visualDirection":"medium shot, walking down Avenue de la Bourdonnais toward the Eiffel Tower visible in the distance, late afternoon golden hour, slight handheld sway, 35mm shallow DOF, hair catching wind","spokenChunk":"okay so i'm finally doing this..."},
    {"visualDirection":"low angle wide shot at the base of the Eiffel Tower, iron lattice towering overhead filling the frame, subject looking up with hand shading eyes, soft warm sun raking through the structure","spokenChunk":"i've been in paris four days..."},
    {"visualDirection":"close-up profile, subject smiling softly with the Eiffel Tower's iron beams visible bokeh'd behind their shoulder, magic-hour rim light, 85mm","spokenChunk":"but the light is doing this thing..."}
  ],
  "hashtags": ["paris","eiffeltower","goldenhour","solotravel","slowtravel","parisdiaries"]
}

Now plan beats for the actual topic above with the same level of specificity.`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJsonStrict(text) as ReturnType<typeof mockBeats>;
}

function mockBeats(args: { topic: string; beatCount: number; durationSecPerBeat: number }) {
  const beats = Array.from({ length: args.beatCount }, (_, i) => ({
    visualDirection: `beat ${i + 1} of ${args.beatCount} for ${args.topic}, cinematic, specific framing, soft natural light`,
    spokenChunk: `chunk ${i + 1}`,
  }));
  return {
    title: `${args.topic} (${args.beatCount} beats)`,
    globalCaption: `${args.topic.slice(0, 40)}`,
    fullScript: `Here's a continuous narration about ${args.topic} that flows naturally across all ${args.beatCount} beats — picking up small details as the camera moves through the moment.`,
    beats,
    hashtags: ["fyp", "foryou", args.topic.replace(/\s+/g, "").toLowerCase()],
  };
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
