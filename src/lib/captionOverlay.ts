import "server-only";
import sharp from "sharp";

// ffmpeg-static ships without libfreetype, so the drawtext filter can't render
// captions directly. Instead we generate a transparent PNG of the caption
// using sharp (SVG -> raster) and overlay it on the video via ffmpeg's
// overlay filter, which IS available everywhere.

export type CaptionOverlayOpts = {
  text: string;
  width?: number;   // canvas width (default 1080)
  height?: number;  // canvas height (default 1920)
  fontSize?: number;
  yRatio?: number;  // vertical placement, 0 top -> 1 bottom (default 0.18)
  align?: "center" | "top" | "bottom";
};

export async function renderCaptionPng(opts: CaptionOverlayOpts): Promise<Buffer> {
  const w = opts.width ?? 1080;
  const h = opts.height ?? 1920;
  const fontSize = opts.fontSize ?? 64;
  const yRatio = opts.yRatio ?? 0.18;

  const lines = wrapToLines(opts.text, Math.floor(w / (fontSize * 0.55)));
  const lineHeight = Math.round(fontSize * 1.15);
  const blockHeight = lines.length * lineHeight;
  const yStart =
    opts.align === "bottom"
      ? Math.round(h - blockHeight - h * 0.18)
      : opts.align === "top"
        ? Math.round(h * 0.05) + fontSize
        : Math.round(h * yRatio) + fontSize;

  // Each line has a black stroked outline + white fill — readable on any
  // background, mimics the burn-in look most short-form creators use.
  const tspans = lines
    .map((line, i) => {
      const y = yStart + i * lineHeight;
      const safe = escapeXml(line);
      return `<text x="${w / 2}" y="${y}"
            font-family="DejaVu Sans, Arial, Helvetica, sans-serif"
            font-size="${fontSize}"
            font-weight="700"
            text-anchor="middle"
            fill="white"
            stroke="black"
            stroke-width="6"
            paint-order="stroke">${safe}</text>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
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
  return lines.slice(0, 4); // hard cap to avoid wall-of-text
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
