import { NextRequest } from "next/server";
import { readAssetStream } from "@/lib/storage";

export const runtime = "nodejs";

// Public proxy for stored assets. Backed by S3 (R2/etc) or local filesystem
// depending on configuration — callers don't need to know which. Used by
// the in-app gallery and by external services like fal.ai that need to fetch
// reference images during multi-step pipelines.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.map((p) => p.replace(/\.\./g, "")).join("/");

  try {
    const { stream, size, contentType } = await readAssetStream(key);
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    if (size !== undefined) headers["Content-Length"] = String(size);
    return new Response(stream, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/NoSuchKey|ENOENT|not found/i.test(msg)) {
      return new Response("not found", { status: 404 });
    }
    return new Response(`asset error: ${msg}`, { status: 500 });
  }
}
