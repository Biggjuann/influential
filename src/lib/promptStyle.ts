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
}): string {
  const f = getFormat(args.format);
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
