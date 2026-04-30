import "server-only";
import type { CaptionStyleConfig } from "./db/schema";

// Generate an ASS (Advanced SubStation Alpha) subtitle file with full
// libass-quality styling. Burned in via ffmpeg's `subtitles=` filter, this
// produces broadcast-grade caption rendering: real font kerning, scalable
// outlines, true alpha blending, optional shadow, optional opaque box.
//
// Color encoding in ASS is &HAABBGGRR (alpha-then-BGR) where alpha 00 is
// fully visible and FF is fully transparent — inverted from CSS.

export type AssBuildArgs = {
  text: string;
  style?: CaptionStyleConfig;
  durationSec: number;
  videoW?: number;
  videoH?: number;
};

export function buildAss(args: AssBuildArgs): string {
  const w = args.videoW ?? 1080;
  const h = args.videoH ?? 1920;
  const s = args.style ?? {};

  const fontName = (s.font ?? "Roboto").replace(/[\r\n,]/g, "");
  const fontSize = s.fontSize ?? 64;
  const bold = (s.weight ?? 700) >= 600 ? -1 : 0;
  const italic = s.italic ? -1 : 0;
  const outlineWidth = Math.max(0, s.strokeWidth ?? 6);

  // Position via ASS Alignment numpad: 7=top-l 8=top-c 9=top-r,
  // 4=mid-l 5=mid-c 6=mid-r, 1=bot-l 2=bot-c 3=bot-r.
  const alignment = s.position === "top" ? 8 : s.position === "center" ? 5 : 2;
  const marginV = s.position === "center" ? 0 : Math.round(h * 0.13);

  // BorderStyle 1 = outline + drop shadow; 4 = opaque box behind text
  // (libass extension that respects BackColour alpha).
  const borderStyle = s.background ? 4 : 1;

  const primary = hexToAss(s.color ?? "#ffffff", 0);
  const outline = hexToAss(s.strokeColor ?? "#000000", 0);
  const back = s.background
    ? hexToAss(s.background.color ?? "#000000", inverseAlpha(s.background.opacity ?? 0.55))
    : "&H00000000";

  const shadow = s.shadow ? Math.max(1, Math.round((s.shadow.blur ?? 6) / 2 + (s.shadow.offsetY ?? 0) / 4)) : 0;

  const text = s.uppercase ? args.text.toUpperCase() : args.text;
  const escaped = escapeAssText(text);

  const startTime = "0:00:00.00";
  const endTime = formatAssTime(args.durationSec);

  return [
    `[Script Info]`,
    `ScriptType: v4.00+`,
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    `WrapStyle: 0`,
    `ScaledBorderAndShadow: yes`,
    `YCbCr Matrix: TV.709`,
    ``,
    `[V4+ Styles]`,
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`,
    `Style: Cap,${fontName},${fontSize},${primary},&H000000FF,${outline},${back},${bold},${italic},0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadow},${alignment},80,80,${marginV},1`,
    ``,
    `[Events]`,
    `Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`,
    `Dialogue: 0,${startTime},${endTime},Cap,,0,0,0,,${escaped}`,
    ``,
  ].join("\n");
}

function hexToAss(hex: string, alpha: number = 0): string {
  const m = hex.replace(/^#/, "");
  if (m.length !== 6) return "&H00000000";
  const r = m.slice(0, 2).toUpperCase();
  const g = m.slice(2, 4).toUpperCase();
  const b = m.slice(4, 6).toUpperCase();
  const a = Math.max(0, Math.min(255, Math.round(alpha))).toString(16).toUpperCase().padStart(2, "0");
  return `&H${a}${b}${g}${r}`;
}

// Convert UI opacity (0=invisible, 1=opaque) to ASS alpha byte
// (0=opaque, 255=invisible).
function inverseAlpha(opacity: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255);
}

function formatAssTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const cs = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(Math.floor(s)).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  // ASS uses {} for inline override codes — escape literal braces in user text.
  // Newlines become \N (hard break).
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}
