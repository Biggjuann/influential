import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { Button } from "@/components/Button";

export const dynamic = "force-dynamic";

export default function Home() {
  const rows = db.select().from(schema.influencers).orderBy(desc(schema.influencers.createdAt)).all();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your roster</h1>
          <p className="text-muted mt-1">Generate AI influencers and short-form video on command.</p>
        </div>
        <Link href="/influencers/new">
          <Button>+ New influencer</Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel p-12 text-center">
          <p className="text-muted mb-4">No influencers yet.</p>
          <Link href="/influencers/new">
            <Button>Create your first</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/influencers/${r.id}`}
              className="group rounded-xl border border-border bg-panel overflow-hidden hover:border-accent/60 transition-colors"
            >
              <CanonicalThumb canonicalImageId={r.canonicalImageId} />
              <div className="p-4">
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-muted">{r.niche}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CanonicalThumb({ canonicalImageId }: { canonicalImageId: string | null }) {
  if (!canonicalImageId) {
    return (
      <div className="aspect-[9/16] bg-gradient-to-br from-accent/20 to-accent2/20 grid place-items-center text-muted text-sm">
        generating…
      </div>
    );
  }
  const asset = db.select().from(schema.assets).where(eq(schema.assets.id, canonicalImageId)).get();
  if (!asset) return <div className="aspect-[9/16] bg-panel" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={asset.url} alt="" className="aspect-[9/16] w-full object-cover" />
  );
}
