// Client-safe font registry. Each entry must be installed in the runtime
// Dockerfile via apt-get fonts-* packages, otherwise the SVG renderer
// (server-side) will fall back to a missing-glyph box.
export const AVAILABLE_FONTS = [
  { id: "DejaVu Sans", label: "DejaVu Sans" },
  { id: "DejaVu Serif", label: "DejaVu Serif" },
  { id: "Noto Sans", label: "Noto Sans" },
  { id: "Noto Sans Display", label: "Noto Sans Display" },
  { id: "Noto Serif", label: "Noto Serif" },
  { id: "Liberation Sans", label: "Liberation Sans (Arial-like)" },
  { id: "Liberation Serif", label: "Liberation Serif (Times-like)" },
  { id: "Liberation Mono", label: "Liberation Mono" },
] as const;

export type FontId = (typeof AVAILABLE_FONTS)[number]["id"];
