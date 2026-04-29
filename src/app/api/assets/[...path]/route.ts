import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { readFromFsKey, storageMode } from "@/lib/storage";

export const runtime = "nodejs";

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

// Fallback file server for FS storage mode (local dev / mock). In S3 mode,
// asset URLs point directly at the bucket and never hit this route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (storageMode !== "fs") return new Response("not found", { status: 404 });

  const { path } = await params;
  const key = path.map((p) => p.replace(/\.\./g, "")).join("/");
  let info;
  try {
    info = await readFromFsKey(key);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const ext = info.path.split(".").pop()?.toLowerCase() ?? "";
  const stream = Readable.toWeb(createReadStream(info.path)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
