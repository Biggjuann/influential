import { notFound } from "next/navigation";
import { db, schema, ready } from "@/lib/db";
import { eq, desc, and } from "drizzle-orm";
import { StudioClient } from "./StudioClient";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).limit(1)
  )[0];
  if (!inf) notFound();
  const canonical = inf.canonicalImageId
    ? (
        await db.select().from(schema.assets).where(eq(schema.assets.id, inf.canonicalImageId)).limit(1)
      )[0]
    : null;

  const images = await db
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.influencerId, id), eq(schema.assets.kind, "image")))
    .orderBy(desc(schema.assets.createdAt))
    .limit(12);
  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.influencerId, id))
    .orderBy(desc(schema.products.createdAt));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <div className="text-sm text-muted">{inf.name}</div>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Video studio</h1>
        <p className="text-muted mb-8">
          Give a topic. Claude writes the script, F5-TTS voices it, Wan animates a keyframe, and
          LatentSync syncs the lips. Output is 1080×1920 with burned captions.
        </p>
        <StudioClient
          influencerId={inf.id}
          hasCanonical={!!canonical}
          galleryImages={images.map((i) => ({ id: i.id, url: i.url }))}
          defaultFormat={inf.persona.defaultFormat ?? "cinematic"}
          products={products}
        />
      </div>

      <aside className="rounded-xl border border-border bg-panel p-4 h-fit lg:sticky lg:top-24">
        <div className="text-sm font-medium mb-2">Identity</div>
        {canonical ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={canonical.url} alt="" className="rounded-md aspect-[9/16] w-full object-cover" />
        ) : (
          <div className="rounded-md aspect-[9/16] bg-bg grid place-items-center text-muted text-sm p-4 text-center">
            No canonical image yet. Pick one from the influencer page first.
          </div>
        )}
        <dl className="mt-4 space-y-2 text-xs">
          <Row label="Voice">{inf.persona.voiceDescription}</Row>
          <Row label="Pillars">{inf.persona.contentPillars.join(", ")}</Row>
        </dl>
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
