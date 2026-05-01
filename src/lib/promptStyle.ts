import "server-only";
import { getFormat, type Format, type ShotType } from "./formatPresets";

/**
 * Build the keyframe prompt for an image-to-video scene.
 * Format: <style anchor> · <user/AI scene direction> · <character traits if subject>
 * Order matters — image models weight the front of the prompt heavily.
 */
export function buildKeyframePrompt(args: {
  visualDirection: string;
  format: Format;
  shotType: ShotType;
  characterPrompt?: string;
  /** When set, the multi-ref model also gets a directive telling it how to
   * combine the two reference images (subject from #1, product from #2). */
  withProduct?: { name: string; description?: string | null };
}): string {
  const f = getFormat(args.format);

  // When a product reference is attached, lead with VERY explicit
  // multi-image instructions. Nano Banana / Qwen-Edit / Kontext-Multi all
  // work better when each input image is named ("Image 1 = person, Image 2
  // = product") and the model is told to preserve specific attributes of
  // the product image rather than reinterpret them. This is what stops the
  // output from being "Flux's idea of a blender" instead of the user's
  // actual uploaded blender.
  if (args.withProduct) {
    const desc = args.withProduct.description ? ` (${args.withProduct.description})` : "";
    return [
      `Compose a single photograph using BOTH reference images.`,
      `Image 1 is the PERSON: keep their face, hair, body proportions, and skin exactly as in image 1.`,
      `Image 2 is the PRODUCT — a ${args.withProduct.name}${desc}. The product in the output MUST exactly match image 2's design, colour, controls, materials, branding, and proportions. Do NOT redesign it. Do NOT substitute a different model.`,
      `Action: ${args.visualDirection}.`,
      `${f.prefix}.`,
      args.characterPrompt ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  // No product — the existing format-anchor-then-scene-then-character order.
  const parts = [f.prefix, args.visualDirection];
  if (args.shotType === "subject" && args.characterPrompt) parts.push(args.characterPrompt);
  return parts.filter(Boolean).join(", ");
}

/** Build the negative prompt: persona's negative + format's bake-out list. */
export function buildKeyframeNegative(args: {
  format: Format;
  shotType: ShotType;
  personaNegative?: string;
}): string {
  const f = getFormat(args.format);
  const parts: string[] = [];
  if (args.personaNegative?.trim()) parts.push(args.personaNegative.trim());
  parts.push(f.negative);
  if (args.shotType !== "subject") {
    parts.push("people, person, human, model, portrait, face, character, crowd");
  }
  return parts.join(", ");
}

/** Build the I2V motion prompt for a scene. */
export function buildMotionPrompt(args: {
  visualDirection: string;
  format: Format;
  shotType: ShotType;
}): string {
  const f = getFormat(args.format);
  const motion = f.motion[args.shotType];
  const avoid = f.motionAvoid[args.shotType];
  return `${args.visualDirection.trim()}. ${motion}. avoid: ${avoid}.`;
}

export type { Format } from "./formatPresets";
