import { notFound, redirect } from "next/navigation";
import { db, schema, ready } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import { NewReelClient } from "./NewReelClient";

export const dynamic = "force-dynamic";

export default async function NewReelPage({ params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const inf = (
    await db.select().from(schema.influencers).where(eq(schema.influencers.id, id)).limit(1)
  )[0];
  if (!inf) notFound();
  if (!inf.canonicalImageId) {
    redirect(`/influencers/${id}`);
  }

  const images = await db
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.influencerId, id), eq(schema.assets.kind, "image")))
    .orderBy(desc(schema.assets.createdAt))
    .limit(24);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-sm text-muted">{inf.name}</div>
      <h1 className="text-3xl font-semibold tracking-tight mb-1">New reel</h1>
      <p className="text-muted mb-8">
        Stitch a multi-scene story with a continuous voiceover and a single caption that persists
        across the whole edit.
      </p>
      <NewReelClient
        influencerId={inf.id}
        gallery={images.map((i) => ({ id: i.id, url: i.url }))}
        defaultFormat={inf.persona.defaultFormat ?? "cinematic"}
      />
    </div>
  );
}
