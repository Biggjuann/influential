// Client-safe format registry. Each format is a complete preset that drives:
//   - Keyframe prompt anchor (cinematic vs amateur/UGC look)
//   - Negative prompt baseline
//   - Motion language for the I2V model (handheld vs gimbal etc.)
//   - Default shot mix (subject-heavy vs B-roll-heavy)
//   - "Beat pattern" guidance fed to the Claude beat planner so the
//     sequence structure matches the format (unboxing arc vs review arc).
//
// This file is imported by both server (pipeline + Claude prompt) and
// client (the UI picker), so it must not import "server-only".

export type Format =
  | "ugc"
  | "tutorial"
  | "unboxing"
  | "product_review"
  | "try_on"
  | "travel"
  | "cinematic";

export type ShotType = "subject" | "scenery" | "detail";
export type ShotMix = "talking" | "mixed" | "travel";

type FormatPreset = {
  label: string;
  emoji: string;
  description: string;
  // High-level shot family that drives keyframe and motion. UGC anchors
  // away from cinematic / 35mm; cinematic anchors into editorial film look.
  shotFamily: "ugc" | "cinematic";
  prefix: string;
  negative: string;
  motion: Record<ShotType, string>;
  motionAvoid: Record<ShotType, string>;
  defaultShotMix: ShotMix;
  // Free-form guidance the beat planner injects into Claude's system
  // prompt so the N-beat sequence has the right structure for the format.
  beatPattern: string;
};

export const FORMAT_PRESETS: Record<Format, FormatPreset> = {
  ugc: {
    label: "UGC",
    emoji: "📱",
    description: "Realistic social media video — phone in hand, casual, candid.",
    shotFamily: "ugc",
    prefix:
      "amateur iPhone footage, vertical phone video, casual handheld, natural daylight or soft indoor lamp light, slight motion blur, candid framing, social media UGC, raw unedited look",
    negative:
      "cinematic, editorial, professional photography, 35mm film, studio lighting, dramatic shadows, shallow depth of field, color graded, polished, advertising look, cgi, deformed face, watermark",
    motion: {
      subject:
        "selfie cam point of view OR friend filming on iPhone, slight handheld bob, casual unsteady framing, natural amateur movement, vertical 9:16",
      scenery:
        "phone-in-hand walking POV, casual handheld pan, natural bounce as person walks, point-and-shoot phone capture, 9:16 vertical",
      detail:
        "iPhone close-up, slight handheld jitter, casual phone capture, no rack focus pull",
    },
    motionAvoid: {
      subject:
        "smooth gimbal, dolly, crane shot, cinematic camera moves, professional cinematography, rubbing hands, exaggerated expressions",
      scenery: "drone shot, gimbal smoothness, professional cinematography, color graded look",
      detail: "professional macro lens, ring light, color graded",
    },
    defaultShotMix: "talking",
    beatPattern:
      "Casual lifestyle / vlog moments. The creator addresses the camera or is captured candidly by a friend. Conversational, observational, low-key. Avoid 'tutorial' or 'review' framing.",
  },
  tutorial: {
    label: "Tutorial",
    emoji: "👩‍🍳",
    description: "Step-by-step how-to — kitchen counter, desk, hands demonstrating.",
    shotFamily: "ugc",
    prefix:
      "amateur iPhone video tutorial, top-down or shoulder POV, kitchen counter or desk surface, hands demonstrating each step, natural daylight, social media UGC",
    negative:
      "cinematic, editorial, studio lighting, advertising look, color graded, drone shot, watermark",
    motion: {
      subject:
        "creator narrating to phone propped on counter, hands moving in frame, slight casual handheld, vertical 9:16",
      scenery:
        "static phone propped up showing the workspace, natural ambient kitchen / desk motion, 9:16 vertical",
      detail:
        "top-down macro phone capture of hands performing one step, slight handheld jitter, sharp on the action",
    },
    motionAvoid: {
      subject: "gimbal smoothness, cinematic moves, posed framing",
      scenery: "drone, dolly, crane",
      detail: "professional macro lens, ring light, color graded",
    },
    defaultShotMix: "mixed",
    beatPattern:
      "Step-by-step structure. Beat 1 = quick intro to what we're making/doing. Middle beats = each step shown by hands (use 'detail' shotType for each step). Final beat = the finished result with the creator. Spoken script narrates each step in order.",
  },
  unboxing: {
    label: "Unboxing",
    emoji: "📦",
    description: "Opening packaging — close-up hands, anticipation, reveal, reaction.",
    shotFamily: "ugc",
    prefix:
      "amateur iPhone footage, close-up of hands opening packaging, kraft paper / cardboard / branded box, natural daylight on a desk or floor, social media UGC, casual handheld",
    negative:
      "cinematic, editorial, studio lighting, advertising look, color graded, watermark",
    motion: {
      subject:
        "selfie cam close-up of creator's reaction, casual handheld, slight zoom-in for excitement, vertical 9:16",
      scenery:
        "phone propped showing the workspace, package on desk/floor, ambient handheld bob",
      detail:
        "iPhone macro mode close-up of hands cutting tape / lifting flaps / pulling tissue paper, slight handheld jitter",
    },
    motionAvoid: {
      subject: "gimbal, smooth dolly, ad-style cinematography",
      scenery: "drone, professional cinematography",
      detail: "ring light, color graded, professional macro",
    },
    defaultShotMix: "mixed",
    beatPattern:
      "Anticipation arc. Beat 1 = closed package on the surface (detail or subject holding it). Middle beats = the opening process: cutting tape, lifting flaps, pulling tissue, first peek. Final beat = the product fully revealed + creator's reaction. Voiceover is curious / excited / rambling, not scripted.",
  },
  product_review: {
    label: "Product Review",
    emoji: "🛍️",
    description: "Authentic phone-shot review — holding the product, demonstrating features.",
    shotFamily: "ugc",
    prefix:
      "amateur iPhone footage, casual seated review, creator holding product to camera, natural daylight in living room or bedroom, social media UGC",
    negative:
      "cinematic, editorial, studio lighting, advertising look, color graded, watermark",
    motion: {
      subject:
        "creator addressing phone propped on a surface, holding product up to camera, slight casual handheld bob, vertical 9:16",
      scenery: "ambient living-room / desk B-roll, natural handheld pan",
      detail:
        "iPhone close-up of the product surface, label, button, or feature being demonstrated, slight handheld jitter",
    },
    motionAvoid: {
      subject: "gimbal, dolly, ad-style cinematography, posed model framing",
      scenery: "drone, color graded look",
      detail: "ring light, professional macro, color graded",
    },
    defaultShotMix: "mixed",
    beatPattern:
      "Honest review structure. Beat 1 = creator on camera intro, holding product. Middle beats = demonstrating one or two specific features (use 'detail' shots of the product). Final beat = personal verdict from the creator on camera. Voiceover is conversational, not marketing.",
  },
  try_on: {
    label: "Virtual Try-On",
    emoji: "👗",
    description: "Mirror selfies showing outfits, accessories, or styling moments.",
    shotFamily: "ugc",
    prefix:
      "iPhone mirror selfie, vertical, phone visible in hand or reflected in mirror, full-body or 3/4 view, natural bedroom / boutique / closet lighting, casual UGC",
    negative:
      "cinematic, editorial, studio lighting, fashion magazine, color graded, watermark, professional model pose",
    motion: {
      subject:
        "mirror selfie pose, slight body shift / outfit fluff / hair flip, phone slightly bobbing, vertical 9:16",
      scenery: "ambient bedroom / closet / boutique B-roll, natural handheld",
      detail:
        "iPhone close-up of outfit detail (fabric, hem, jewelry, label), slight handheld jitter",
    },
    motionAvoid: {
      subject: "professional model pose, runway, gimbal smoothness, fashion photography",
      scenery: "drone, color graded",
      detail: "ring light, professional macro",
    },
    defaultShotMix: "talking",
    beatPattern:
      "Outfit-rotation structure. Each beat = one mirror selfie of one look (different outfit / accessory each time). Final beat can be a favorite or 'which one?' poll. Voiceover names each piece briefly.",
  },
  travel: {
    label: "Travel",
    emoji: "✈️",
    description: "Location-heavy — scenery, food, transit, with the creator in some shots.",
    shotFamily: "ugc",
    prefix:
      "amateur iPhone footage, vertical phone video, walking POV, natural daylight, candid travel content, social media UGC",
    negative:
      "cinematic drone, color graded, editorial, advertising look, watermark, stock photo",
    motion: {
      subject:
        "selfie cam walking, slight handheld bob, natural amateur framing, vertical 9:16",
      scenery:
        "phone-in-hand walking POV, casual handheld pan across the scene, natural amateur capture, 9:16 vertical",
      detail:
        "iPhone close-up of food / sign / texture / hands holding ticket or drink, slight handheld jitter",
    },
    motionAvoid: {
      subject: "gimbal, smooth dolly, posed model framing",
      scenery: "drone, gimbal, color graded look",
      detail: "ring light, professional macro",
    },
    defaultShotMix: "travel",
    beatPattern:
      "Location-as-the-star structure. ~30% subject (creator on camera), ~70% scenery + detail B-roll. Open or close on subject; pack the middle with environment shots that reference specific landmarks, food, signs, or transit by name.",
  },
  cinematic: {
    label: "Cinematic",
    emoji: "🎬",
    description: "Editorial / hero look — 35mm film, dramatic lighting, professional cinematography.",
    shotFamily: "cinematic",
    prefix:
      "cinematic photograph, photorealistic, 35mm film, professional editorial photography, sharp focus, natural skin texture, detailed",
    negative:
      "cartoon, anime, illustration, 3d render, cgi, plastic skin, deformed face, extra fingers, lowres, watermark, text, stock photo, oversaturated, bad anatomy",
    motion: {
      subject:
        "subtle natural motion: gentle head turn, slow blink, soft breathing, hair shifting in air, ambient camera drift, cinematic 24fps",
      scenery:
        "slow cinematic camera move: gentle pan or push-in, atmospheric parallax, light shifting through clouds or foliage, ambient environmental motion (water, wind, distant traffic), 24fps",
      detail: "macro focus pull, slight handheld breathing, gentle subject motion, 24fps",
    },
    motionAvoid: {
      subject: "rubbing hands, repetitive gestures, exaggerated facial expressions, morphing limbs",
      scenery: "people walking into frame, generic stock motion, jittery camera, unnatural zooms",
      detail: "morphing object shape, jittery focus, talking heads",
    },
    defaultShotMix: "mixed",
    beatPattern:
      "Editorial / brand-film arc. Establishing → escalate → midpoint → resolve. Cinematic shot language (specific lens, lighting, micro-action). Suitable for fashion, brand, hero campaigns.",
  },
};

export const FORMAT_LIST = Object.keys(FORMAT_PRESETS) as Format[];

export function getFormat(format?: string): FormatPreset {
  if (format && format in FORMAT_PRESETS) return FORMAT_PRESETS[format as Format];
  return FORMAT_PRESETS.cinematic;
}
