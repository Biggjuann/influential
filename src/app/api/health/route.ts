import { storageMode } from "@/lib/storage";
import { getPublicBaseUrl } from "@/lib/publicUrl";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    ts: Date.now(),
    storage: storageMode,
    publicBaseUrl: getPublicBaseUrl() ?? null,
    config: {
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      hasFal: !!process.env.FAL_KEY,
      hasDb: !!process.env.DATABASE_URL,
      hasS3Bucket: !!process.env.S3_BUCKET,
      hasS3PublicUrl: !!process.env.S3_PUBLIC_URL,
      mockMode: process.env.USE_MOCK_PROVIDERS === "1",
    },
  });
}
