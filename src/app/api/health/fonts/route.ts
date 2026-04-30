import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { AVAILABLE_FONTS } from "@/lib/captionFonts";

export const runtime = "nodejs";

// Lists every font fontconfig can see at runtime + checks each font the UI
// claims to support actually resolves. If a UI font is missing, fonts-* apt
// packages need to be added to the Dockerfile.
export async function GET() {
  let installed: string[] = [];
  let fcAvailable = false;
  try {
    const out = execSync("fc-list :family", { encoding: "utf8" });
    fcAvailable = true;
    installed = Array.from(
      new Set(
        out
          .split("\n")
          .flatMap((line) => line.split(",").map((s) => s.trim()))
          .filter(Boolean),
      ),
    ).sort();
  } catch {
    // fontconfig not installed
  }

  const lc = installed.map((s) => s.toLowerCase());
  const verification = AVAILABLE_FONTS.map((f) => ({
    id: f.id,
    label: f.label,
    installed: lc.some((s) => s === f.id.toLowerCase() || s.startsWith(f.id.toLowerCase())),
  }));

  return Response.json({
    fcAvailable,
    systemFfmpeg: existsSync("/usr/bin/ffmpeg"),
    uiFonts: verification,
    missing: verification.filter((v) => !v.installed).map((v) => v.id),
    totalInstalled: installed.length,
    sample: installed.slice(0, 30),
  });
}
