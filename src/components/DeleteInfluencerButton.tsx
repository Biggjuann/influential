"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

export function DeleteInfluencerButton({
  influencerId,
  influencerName,
}: {
  influencerId: string;
  influencerName: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/influencers/${influencerId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setArmed(true)}>
        Delete
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-300">
        Delete {influencerName} + all images, videos, jobs?
      </span>
      <Button
        size="sm"
        onClick={doDelete}
        disabled={busy}
        className="bg-red-500 hover:bg-red-500/90 from-red-500 to-red-500"
      >
        {busy ? "Deleting…" : "Confirm"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)} disabled={busy}>
        Cancel
      </Button>
      {err && <span className="text-xs text-red-300">{err}</span>}
    </div>
  );
}
