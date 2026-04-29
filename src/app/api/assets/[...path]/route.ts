import { NextRequest } from "next/server";
import { createReadStream, statSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const ROOT = process.env.STORAGE_DIR ?? "./data/assets";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const safe = path.map((p) => p.replace(/\.\./g, ""));
  const filePath = normalize(join(ROOT, ...safe));
  if (!filePath.startsWith(normalize(ROOT))) {
    return new Response("forbidden", { status: 403 });
  }
  if (!existsSync(filePath)) return new Response("not found", { status: 404 });
  const stat = statSync(filePath);
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
