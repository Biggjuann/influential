"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

export default function NewInfluencer() {
  const router = useRouter();
  const [niche, setNiche] = useState("");
  const [vibe, setVibe] = useState("");
  const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ niche, vibe: vibe || undefined, gender: gender || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = (await res.json()) as { id: string };
      router.push(`/influencers/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">New influencer</h1>
      <p className="text-muted mb-8">
        Describe the niche and vibe. Claude will design the persona, then a starter image pack
        renders in the background.
      </p>

      <form onSubmit={submit} className="space-y-5">
        <Field label="Niche" hint="e.g. minimalist skincare, slow living, indie tech reviews">
          <input
            required
            autoFocus
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="w-full h-11 rounded-md border border-border bg-panel px-3 text-sm focus:border-accent outline-none"
            placeholder="minimalist skincare"
          />
        </Field>
        <Field label="Vibe (optional)" hint="aesthetic, tone, references">
          <input
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            className="w-full h-11 rounded-md border border-border bg-panel px-3 text-sm focus:border-accent outline-none"
            placeholder="quiet luxury, european, golden hour"
          />
        </Field>
        <Field label="Gender (optional)" hint="leave blank for Claude to decide">
          <input
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full h-11 rounded-md border border-border bg-panel px-3 text-sm focus:border-accent outline-none"
            placeholder="woman / man / nonbinary"
          />
        </Field>

        {err && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {err}
          </div>
        )}

        <Button type="submit" disabled={busy || !niche} size="lg" className="w-full">
          {busy ? "Designing persona…" : "Generate influencer"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
