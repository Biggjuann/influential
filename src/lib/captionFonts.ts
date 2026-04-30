// Client-safe font registry. Each entry MUST be installed in the runtime
// Dockerfile via apt-get fonts-* packages, otherwise libass / sharp will
// silently fall back to the next match.
//
// To verify what's actually installed at runtime, hit /api/health/fonts.
export const AVAILABLE_FONTS = [
  // Sans-serif workhorses
  { id: "Roboto", label: "Roboto" },
  { id: "Open Sans", label: "Open Sans" },
  { id: "Liberation Sans", label: "Liberation Sans (Arial-like)" },
  { id: "DejaVu Sans", label: "DejaVu Sans" },
  { id: "Noto Sans", label: "Noto Sans" },
  { id: "Noto Sans Display", label: "Noto Sans Display (bold display weight)" },
  // Serifs
  { id: "Liberation Serif", label: "Liberation Serif (Times-like)" },
  { id: "DejaVu Serif", label: "DejaVu Serif" },
  { id: "Noto Serif", label: "Noto Serif" },
  // Display / decorative
  { id: "Pacifico", label: "Pacifico (handwriting)" },
  { id: "Lobster", label: "Lobster (display script)" },
  // Mono
  { id: "Liberation Mono", label: "Liberation Mono" },
] as const;

export type FontId = (typeof AVAILABLE_FONTS)[number]["id"];
