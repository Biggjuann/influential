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

      <details className="rounded-xl border border-border bg-panel p-5">
        <summary className="cursor-pointer text-sm text-muted">Persona JSON</summary>
        <pre className="mt-3 text-xs overflow-x-auto">{JSON.stringify(inf.persona, null, 2)}</pre>
      </details>
    </div>
  );
}
