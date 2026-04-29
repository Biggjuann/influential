import { db, schema, ready } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

// Pulls the most recent image asset and HEAD-fetches its public URL exactly
// like fal.ai would. Use this to verify that the URL we're storing is actually
// reachable from the public internet.
export async function GET(req: Request) {
  await ready();
  const u = new URL(req.url);
  const influencerId = u.searchParams.get("influencerId");

  const query = db.select().from(schema.assets).orderBy(desc(schema.assets.createdAt)).limit(1);
  const rows = influencerId
    ? await db
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.influencerId, influencerId))
        .orderBy(desc(schema.assets.createdAt))
        .limit(1)
    : await query;

  const asset = rows[0];
  if (!asset) {
    return Response.json({ ok: false, error: "no assets in DB yet — create an influencer first" });
  }

  let probe: Record<string, unknown> = { tried: asset.url };
  try {
    const res = await fetch(asset.url, { method: "GET" });
    const bodyPreview = res.ok ? `(${res.headers.get("content-length") ?? "?"} bytes)` : await res.text();
    probe = {
      tried: asset.url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      bodyPreview: bodyPreview.slice(0, 300),
    };
  } catch (err) {
    probe = {
      tried: asset.url,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return Response.json({
    asset: {
      id: asset.id,
      kind: asset.kind,
      url: asset.url,
      storageKey: asset.storageKey,
      influencerId: asset.influencerId,
    },
    probe,
  });
}
