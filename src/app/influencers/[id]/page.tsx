import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema, ready } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { InfluencerHeaderCard } from "@/components/InfluencerHeaderCard";
import { ProductsSection } from "@/components/ProductsSection";
import { InfluencerClient } from "./InfluencerClient";

export const dynamic = "force-dynamic";

export default async function InfluencerPage({ params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).limit(1)
  )[0];
  if (!inf) notFound();

  const allAssets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.influencerId, id))
    .orderBy(desc(schema.assets.createdAt));

  const images = allAssets.filter((a) => a.kind === "image");
  const videos = allAssets.filter((a) => a.kind === "video");
  const reels = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.influencerId, id))
    .orderBy(desc(schema.stories.createdAt));
  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.influencerId, id))
    .orderBy(desc(schema.products.createdAt));

  return (
    <div className="space-y-10">
      <InfluencerHeaderCard
        influencerId={inf.id}
        name={inf.name}
        niche={inf.niche}
        persona={inf.persona}
        voiceRefUrl={inf.voiceRefUrl}
      />

      <InfluencerClient
        influencerId={inf.id}
        canonicalImageId={inf.canonicalImageId}
        initialImages={images}
        initialVideos={videos}
      />

      <ProductsSection influencerId={inf.id} initialProducts={products} />

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Reels</h2>
          <Link href={`/influencers/${inf.id}/reels/new`} className="text-sm text-accent hover:opacity-80">
            + new reel
          </Link>
        </div>
        {reels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted text-sm">
            No reels yet. A reel stitches multiple scenes with continuous voiceover and a
            persistent caption.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reels.map((r) => (
              <Link
                key={r.id}
                href={`/influencers/${inf.id}/reels/${r.id}`}
                className="rounded-xl border border-border bg-panel p-4 hover:border-accent/60 transition-colors"
              >
                <div className="text-sm font-medium truncate">{r.title}</div>
                <div className="text-xs text-muted mt-1">
                  {r.scenes.length} scenes · {r.scenes.reduce((s, x) => s + x.durationSec, 0)}s · {r.status}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <details className="rounded-xl border border-border bg-panel p-5">
        <summary className="cursor-pointer text-sm text-muted">Persona JSON</summary>
        <pre className="mt-3 text-xs overflow-x-auto">{JSON.stringify(inf.persona, null, 2)}</pre>
      </details>
    </div>
  );
}
