import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema, ready } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { Button } from "@/components/Button";
import { PersonaEditor } from "@/components/PersonaEditor";
import { DeleteInfluencerButton } from "@/components/DeleteInfluencerButton";
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

  return (
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="text-sm text-muted">{inf.niche}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{inf.name}</h1>
          <p className="text-muted mt-2 max-w-2xl">{inf.persona.backstory}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {inf.persona.contentPillars.map((p) => (
              <span key={p} className="text-xs rounded-full border border-border bg-panel px-2.5 py-1">
                {p}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DeleteInfluencerButton influencerId={inf.id} influencerName={inf.name} />
          <PersonaEditor
            influencerId={inf.id}
            initialName={inf.name}
            initialNiche={inf.niche}
            initialPersona={inf.persona}
          />
          <Link href={`/influencers/${inf.id}/reels/new`}>
            <Button variant="secondary">🎞 New reel</Button>
          </Link>
          <Link href={`/influencers/${inf.id}/studio`}>
            <Button>🎬 New video</Button>
          </Link>
        </div>
      </header>

      <InfluencerClient
        influencerId={inf.id}
        canonicalImageId={inf.canonicalImageId}
        initialImages={images}
        initialVideos={videos}
      />

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
