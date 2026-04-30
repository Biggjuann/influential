import "server-only";
import sharp from "sharp";

// ffmpeg-static ships without libfreetype, so the drawtext filter can't render
// captions directly. Instead we generate a transparent PNG of the caption
// using sharp (SVG -> raster) and overlay it on the video via ffmpeg's
// overlay filter, which IS available everywhere.
//
// The runtime image installs DejaVu, Noto, and Liberation font families so
// any of them can be referenced in the SVG without falling back to the
// missing-glyph box.

export type CaptionPosition = "top" | "center" | "bottom";

export type CaptionStyle = {
  font?: string; // any font installed in the runtime image
  fontSize?: number;
  weight?: 400 | 600 | 700 | 800;
  italic?: boolean;
  uppercase?: boolean;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Translucent box behind the text. null/undefined = no box. */
  background?: {
    color?: string;
    opacity?: number;
    paddingX?: number;
    paddingY?: number;
    radius?: number;
  } | null;
  /** Drop shadow under the text. */
  shadow?: {
    offsetX?: number;
    offsetY?: number;
    blur?: number;
    color?: string;
    opacity?: number;
  } | null;
  position?: CaptionPosition;
};

export type CaptionOverlayOpts = {
  text: string;
  width?: number;
  height?: number;
  style?: CaptionStyle;
};

const DEFAULT_STYLE: Required<Omit<CaptionStyle, "background" | "shadow" | "italic" | "uppercase">> & {
  background: CaptionStyle["background"];
  shadow: CaptionStyle["shadow"];
  italic: boolean;
  uppercase: boolean;
} = {
  font: "DejaVu Sans",
  fontSize: 64,
  weight: 700,
  italic: false,
  uppercase: false,
  color: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 6,
  background: null,
  shadow: null,
  position: "top",
};

export async function renderCaptionPng(opts: CaptionOverlayOpts): Promise<Buffer> {
  const w = opts.width ?? 1080;
  const h = opts.height ?? 1920;
  const s = { ...DEFAULT_STYLE, ...(opts.style ?? {}) };

  const text = s.uppercase ? opts.text.toUpperCase() : opts.text;
  const lines = wrapToLines(text, Math.floor(w / (s.fontSize * 0.55)));
  const lineHeight = Math.round(s.fontSize * 1.15);
  const blockHeight = lines.length * lineHeight;

  const yStart =
    s.position === "bottom"
      ? Math.round(h - blockHeight - h * 0.15)
      : s.position === "center"
        ? Math.round((h - blockHeight) / 2 + s.fontSize)
        : Math.round(h * 0.18) + s.fontSize;

  // Optional translucent background box behind the whole text block.
  let bgRect = "";
  if (s.background) {
    const bgColor = s.background.color ?? "#000000";
    const bgOpacity = s.background.opacity ?? 0.55;
    const padX = s.background.paddingX ?? 32;
    const padY = s.background.paddingY ?? 18;
    const radius = s.background.radius ?? 14;
    const longest = lines.reduce((m, line) => Math.max(m, line.length), 0);
    const approxLineWidth = Math.min(w - 80, Math.round(longest * s.fontSize * 0.55));
    const rectX = Math.round((w - approxLineWidth) / 2 - padX);
    const rectY = Math.round(yStart - s.fontSize - padY * 0.5);
    const rectW = approxLineWidth + padX * 2;
    const rectH = blockHeight + padY * 2;
    bgRect = `<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="${radius}" ry="${radius}" fill="${bgColor}" fill-opacity="${bgOpacity}" />`;
  }

  // Optional drop shadow filter — referenced via filter="url(#shadow)" on text.
  let shadowDef = "";
  let shadowAttr = "";
  if (s.shadow) {
    const sx = s.shadow.offsetX ?? 0;
    const sy = s.shadow.offsetY ?? 4;
    const sb = s.shadow.blur ?? 6;
    const sc = s.shadow.color ?? "#000000";
    const so = s.shadow.opacity ?? 0.55;
    shadowDef = `<filter id="cap-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="${sx}" dy="${sy}" stdDeviation="${sb}" flood-color="${sc}" flood-opacity="${so}" />
    </filter>`;
    shadowAttr = ` filter="url(#cap-shadow)"`;
  }

  const fontStyle = s.italic ? "italic" : "normal";
  // Font stack: caller's font first, then progressively safer fallbacks
  // available in our runtime image, then a generic family.
  const fontFamily = `'${s.font.replace(/'/g, "")}', 'DejaVu Sans', 'Noto Sans', 'Liberation Sans', sans-serif`;

  const tspans = lines
    .map((line, i) => {
      const y = yStart + i * lineHeight;
      const safe = escapeXml(line);
      return `<text x="${w / 2}" y="${y}"
            font-family="${fontFamily}"
            font-size="${s.fontSize}"
            font-weight="${s.weight}"
            font-style="${fontStyle}"
            text-anchor="middle"
            fill="${s.color}"
            stroke="${s.strokeColor}"
            stroke-width="${s.strokeWidth}"
            paint-order="stroke"${shadowAttr}>${safe}</text>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>${shadowDef}</defs>
    ${bgRect}
    ${tspans}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function wrapToLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export { AVAILABLE_FONTS } from "./captionFonts";
