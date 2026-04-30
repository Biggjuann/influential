import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema, ready } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { ReelDetailClient } from "./ReelDetailClient";

export const dynamic = "force-dynamic";

export default async function ReelDetailPage({
  params,
}: {
  params: Promise<{ id: string; storyId: string }>;
}) {
  await ready();
  const { id, storyId } = await params;
  const story = (
    await db.select().from(schema.stories).where(eq(schema.stories.id, storyId)).limit(1)
  )[0];
  if (!story || story.influencerId !== id) notFound();

  const output =
    story.outputAssetId
      ? (
          await db
            .select()
            .from(schema.assets)
            .where(eq(schema.assets.id, story.outputAssetId))
            .limit(1)
        )[0]
      : null;

  // Latest job for this story (used to surface live progress while rendering).
  const recentJob = (
    await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.influencerId, id), eq(schema.jobs.kind, "story")))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(20)
  ).find((j) => {
    const input = j.input as { storyId?: string } | null;
    return input?.storyId === storyId;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href={`/influencers/${id}`} className="text-sm text-muted hover:text-text">
          ← back to influencer
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{story.title}</h1>
        <div className="text-sm text-muted mt-1">
          {story.scenes.length} scenes · {story.scenes.reduce((s, x) => s + x.durationSec, 0)}s ·
          {" "}
          {story.mode} · status: {story.status}
        </div>
      </div>

      <ReelDetailClient
        storyId={story.id}
        initialStatus={story.status}
        initialJobId={recentJob?.id ?? null}
        initialVideoUrl={output?.url ?? null}
      />

      <details className="rounded-xl border border-border bg-panel p-5">
        <summary className="cursor-pointer text-sm text-muted">Script + scenes</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <div className="text-muted text-xs">Voiceover</div>
            <div className="whitespace-pre-wrap">{story.fullScript}</div>
          </div>
          {story.globalCaption && (
            <div>
              <div className="text-muted text-xs">Caption</div>
              <div>{story.globalCaption}</div>
            </div>
          )}
          <div className="space-y-2">
            {story.scenes.map((s, i) => (
              <div key={i} className="rounded border border-border p-3">
                <div className="text-xs text-muted">Scene {i + 1} · {s.durationSec}s</div>
                <div className="text-sm mt-1">{s.visualDirection}</div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
