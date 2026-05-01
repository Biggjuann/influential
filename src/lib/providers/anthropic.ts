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
  shotMix?: "talking" | "mixed" | "travel";
  format?: import("../formatPresets").Format;
  formatBeatPattern?: string;
  product?: { name: string; description: string | null } | null;
}) {
  const c = getClient();
  if (!c) return mockBeats(args);

  // ~2.3 words/sec is a natural read pace for ElevenLabs Turbo / F5-TTS.
  // Slightly under because we'd rather a tiny silent tail than the audio
  // bumping into the end of the video and getting -shortest'd off mid-word.
  const totalDurationSec = args.beatCount * args.durationSecPerBeat;
  const targetWords = Math.round(totalDurationSec * 2.2);
  const minWords = Math.max(8, Math.round(totalDurationSec * 1.8));
  const maxWords = Math.round(totalDurationSec * 2.4);
  const shotMix = args.shotMix ?? "mixed";
  const format = args.format ?? "cinematic";
  const formatBeatPattern = args.formatBeatPattern ?? "";

  const formatBlock = formatBeatPattern
    ? `\n\nFORMAT: ${format}\n${formatBeatPattern}\nIMPORTANT: visualDirection language must match this format. For UGC formats avoid "cinematic", "35mm", "editorial", "shallow depth of field" — write like an iPhone capture (handheld, vertical, selfie POV, friend filming, mirror selfie, kitchen counter, etc).`
    : "";

  const productBlock = args.product
    ? `\n\nPRODUCT (must be referenced by name in the script and shown specifically in detail shots):
- Name: ${args.product.name}
${args.product.description ? `- Description: ${args.product.description}` : ""}
The fullScript MUST mention "${args.product.name}" by name at least once. Detail shots in the visualDirection should describe this exact product (its colors, surfaces, packaging) — not a generic placeholder.`
    : "";

  const mixGuidance =
    shotMix === "talking"
      ? `EVERY beat is a "subject" shot — the influencer on camera (medium / close-up / mid-walk-and-talk). No B-roll. Use this for explainers and talking-head formats.`
      : shotMix === "travel"
        ? `Travel-creator B-roll mix: aim for ~30% "subject" shots (the influencer on camera) and ~70% "scenery"/"detail" shots (landscapes, food, signs, hands, architecture, transit). Open and close on subject if it serves the arc; pack the middle with scenery and detail. Specific locations and props in scenery prompts!`
        : `Mixed shot variety: roughly half "subject" (influencer on camera), half "scenery" or "detail" (cutaways and B-roll). Vary framing between beats so it doesn't feel monotone.`;

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `You plan a short vertical TikTok reel as a SEQUENCE of beats — discrete cinematic moments that move a tiny narrative forward.

CRITICAL: each visualDirection becomes the prompt sent to an image-to-video model. The model can only render what you literally describe. If the topic mentions a place, a brand, a prop, an action — those exact things must appear in EVERY beat's visualDirection where relevant. Generic descriptions like "a person walking in soft light" produce videos with nothing to do with the topic.

Each beat has a "shotType":
- "subject" — the influencer on camera. Reference their character traits in visualDirection (framing, micro-action). The pipeline locks the face from canonical.
- "scenery" — pure environment B-roll: landscapes, architecture, streets, transit, weather. NO person in frame. Lean into the location. Think travel-doc cinematography.
- "detail" — close-up cutaway: food, hands, an object, a sign, fabric texture, footprints. Hyper-specific, macro framing.

${mixGuidance}${formatBlock}${productBlock}

Hard rules:
- Each visualDirection MUST reference the specific topic elements (location, prop, action, time of day) by name. "approaching the Eiffel Tower's iron base", not "approaching a tower". For scenery/detail shots, double down on environmental specifics — "rusted padlocks on the Pont des Arts railing" beats "a bridge".
- Each visualDirection should be a SHOT description: framing (wide / medium / close / macro), lens (35mm / 85mm / handheld), lighting (golden hour / overcast / neon), motion or micro-action.
- For "scenery" and "detail" shots: do NOT describe the influencer. The visualDirection should read like a B-roll instruction.
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
Each beat is ${args.durationSecPerBeat}s — total reel is ${totalDurationSec}s.

VOICEOVER LENGTH IS A HARD CONSTRAINT. The fullScript must be between ${minWords} and ${maxWords} words (target ${targetWords}). Going over means TTS audio overruns the video and gets cut off mid-word; going under leaves trailing silence. Count words before you finalize.

Return JSON:
{
  "title": string (3-6 words, internal),
  "globalCaption": string (≤ 50 chars, lowercase preferred — burned across the whole reel),
  "fullScript": string (the FULL continuous spoken voiceover joining all beats — naturally written, not chopped),
  "beats": [
    {
      "visualDirection": string (cinematic shot description for THIS moment, MUST reference the topic's specifics by name),
      "shotType": "subject" | "scenery" | "detail",
      "spokenChunk": string (which slice of the script lands during this beat — informational, not used for separate TTS)
    }
    // ... beatCount entries
  ],
  "hashtags": string[] (5-8 lowercase, no #)
}

Example for topic "walk to the Eiffel Tower" with shotMix=travel and beatCount=5:
{
  "title": "eiffel walk",
  "globalCaption": "first time seeing it up close",
  "fullScript": "okay so i'm finally doing this. four days in paris, kept putting it off. but right now the light is doing this thing through the iron and i think i finally get it.",
  "beats": [
    {"visualDirection":"wide drone-style aerial pulling slowly toward the Eiffel Tower against a golden Parisian skyline, Haussmann rooftops, 24mm","shotType":"scenery","spokenChunk":"okay so i'm finally doing this..."},
    {"visualDirection":"medium handheld shot walking down Avenue de la Bourdonnais, the Eiffel Tower visible centered in the distance, late afternoon golden hour, 35mm shallow DOF, hair catching wind","shotType":"subject","spokenChunk":"four days in paris..."},
    {"visualDirection":"macro close-up of cobblestones and worn Parisian street, soft golden bokeh of distant tourists, slow forward dolly, 50mm","shotType":"detail","spokenChunk":"kept putting it off..."},
    {"visualDirection":"low angle wide shot at the base of the Eiffel Tower, iron lattice towering overhead filling the frame, soft warm sun raking through the structure, no people in frame","shotType":"scenery","spokenChunk":"but right now..."},
    {"visualDirection":"close-up profile, subject smiling softly with the Eiffel Tower's iron beams bokeh'd behind their shoulder, magic-hour rim light, 85mm","shotType":"subject","spokenChunk":"...i think i finally get it."}
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

function mockBeats(args: {
  topic: string;
  beatCount: number;
  durationSecPerBeat: number;
  shotMix?: "talking" | "mixed" | "travel";
}) {
  // Distribute shot types per the mix preset so the mock output mirrors what
  // real Claude would emit shape-wise — keeps the rest of the pipeline honest
  // when running offline.
  const mix = args.shotMix ?? "mixed";
  const shotTypes: ("subject" | "scenery" | "detail")[] = Array.from(
    { length: args.beatCount },
    (_, i) => {
      if (mix === "talking") return "subject";
      if (mix === "travel") {
        if (i === 0 || i === args.beatCount - 1) return "subject";
        return i % 2 === 0 ? "scenery" : "detail";
      }
      return i % 2 === 0 ? "subject" : "scenery";
    },
  );
  const beats = Array.from({ length: args.beatCount }, (_, i) => ({
    visualDirection: `${shotTypes[i] === "subject" ? "subject medium shot" : shotTypes[i] === "scenery" ? "wide environmental scenery" : "macro detail close-up"} for ${args.topic}, cinematic, specific framing, soft natural light`,
    shotType: shotTypes[i],
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

/**
 * Parse a free-form "director's brief" — the multi-paragraph timestamped
 * writing creators naturally produce when describing a reel — into the
 * structured beat list our pipeline renders.
 *
 * The user provides ONE textarea with timestamps ("0-2s", "2-5s"), spoken
 * lines (in quotes), visual direction, and stylistic notes. Claude reads
 * the whole thing, infers format (UGC / unboxing / tutorial / etc),
 * detects each timed beat with its duration + shotType, and returns the
 * structured payload the rest of the pipeline already understands.
 */
export async function parseDirectorsBrief(args: {
  brief: string;
  persona: { name: string; voiceDescription: string; contentPillars: string[] };
  defaultFormat?: import("../formatPresets").Format;
  product?: { name: string; description: string | null } | null;
}): Promise<{
  title: string;
  format: import("../formatPresets").Format;
  globalCaption: string;
  fullScript: string;
  totalDurationSec: number;
  hashtags: string[];
  beats: Array<{
    visualDirection: string;
    durationSec: number;
    shotType: "subject" | "scenery" | "detail";
    spokenChunk: string;
  }>;
}> {
  const c = getClient();
  if (!c) return mockParsedBrief(args);

  const productBlock = args.product
    ? `\n\nA product is attached: "${args.product.name}"${args.product.description ? ` (${args.product.description})` : ""}. The brief should reference this specific product.`
    : "";

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: `You parse a creator's director's brief into a structured reel plan.

The brief is freeform writing with timestamps (e.g. "0-2s", "2-5s", "11-13s"), spoken lines in quotes, and visual direction. Read the WHOLE brief and emit a structured plan.

CRITICAL RULES:

1. Each timestamped block in the brief = ONE beat. Preserve the user's order and durations exactly. If "5-8s" appears, that beat's durationSec = 3.
2. spokenChunk = the literal quoted line for that beat (verbatim, no edits). If a beat has no quoted dialogue, spokenChunk = "".
3. fullScript = all spokenChunks joined naturally with spaces, in beat order. This is what gets sent to TTS.
4. visualDirection = everything ABOUT the visuals for that beat — framing, props, micro-action, lighting, lens, mood. Strip out the spoken line. Keep specific details (colors, materials, exact gestures) — they drive the keyframe.
5. shotType per beat:
   - "subject" = the influencer/creator on camera (talking, gesturing, holding product on camera)
   - "detail" = close-up cutaway (hands on knob, product texture, label, blade, sip)
   - "scenery" = wide environment, no person (kitchen counter alone, sunlight through curtain)
6. Format inference: read the whole brief and pick ONE of:
   ugc / tutorial / unboxing / product_review / try_on / travel / cinematic
   Default to "ugc" if it sounds like phone-shot creator content. "product_review" for "review/demonstrating" briefs. "tutorial" for step-by-step.
7. globalCaption: pull a single 4-8 word caption that captures the hook of the brief, lowercase. Or use the first quoted line if it's short.
8. totalDurationSec = sum of all beat durationSecs.
9. hashtags: 5-8 lowercase tags from the niche/topic.

If timestamps are ambiguous or missing, infer reasonable beat splits from the writing structure (paragraphs, transitions). Aim for 4-8 beats total.

Output JSON only, no markdown fences.`,
    messages: [
      {
        role: "user",
        content: `Persona: ${args.persona.name}
Voice: ${args.persona.voiceDescription}
Pillars: ${args.persona.contentPillars.join(", ")}
${args.defaultFormat ? `Default format if unsure: ${args.defaultFormat}` : ""}${productBlock}

Brief:
"""
${args.brief}
"""

Return JSON:
{
  "title": string (3-6 words, internal),
  "format": "ugc" | "tutorial" | "unboxing" | "product_review" | "try_on" | "travel" | "cinematic",
  "globalCaption": string (≤ 50 chars, lowercase preferred),
  "fullScript": string (all spoken lines joined naturally),
  "totalDurationSec": number,
  "hashtags": string[],
  "beats": [
    {
      "visualDirection": string (cinematic specifics, no quoted dialogue),
      "durationSec": number (integer seconds),
      "shotType": "subject" | "scenery" | "detail",
      "spokenChunk": string (the verbatim quoted line for this beat, or "" if none)
    }
    // ... one entry per timestamped block in the brief
  ]
}`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJsonStrict(text) as ReturnType<typeof mockParsedBrief>;
}

function mockParsedBrief(args: {
  brief: string;
  defaultFormat?: import("../formatPresets").Format;
}) {
  const fmt = args.defaultFormat ?? "ugc";
  // Crude split on timestamp-like patterns — good enough for offline runs.
  const matches = Array.from(args.brief.matchAll(/(\d+)[-–](\d+)\s*s/g));
  const beats =
    matches.length > 0
      ? matches.map((m, i) => ({
          visualDirection: `beat ${i + 1} from brief, cinematic specifics`,
          durationSec: Math.max(2, parseInt(m[2], 10) - parseInt(m[1], 10)),
          shotType: i % 2 === 0 ? ("subject" as const) : ("detail" as const),
          spokenChunk: `Mock line ${i + 1}.`,
        }))
      : [
          {
            visualDirection: "subject medium shot, talking to camera",
            durationSec: 5,
            shotType: "subject" as const,
            spokenChunk: "Mock spoken line from the brief.",
          },
        ];
  const total = beats.reduce((s, b) => s + b.durationSec, 0);
  return {
    title: "brief preview",
    format: fmt,
    globalCaption: "brief preview",
    fullScript: beats.map((b) => b.spokenChunk).join(" "),
    totalDurationSec: total,
    hashtags: ["fyp", "ugc", "viral"],
    beats,
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
