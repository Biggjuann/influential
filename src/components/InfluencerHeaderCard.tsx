"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { DeleteInfluencerButton } from "@/components/DeleteInfluencerButton";
import { PersonaEditor } from "@/components/PersonaEditor";
import type { Persona } from "@/lib/db/schema";

export function InfluencerHeaderCard({
  influencerId,
  name,
  niche,
  persona,
  voiceRefUrl,
}: {
  influencerId: string;
  name: string;
  niche: string;
  persona: Persona;
  voiceRefUrl: string | null;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-panel p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted">{niche}</div>
            <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
            <p className="text-muted mt-2 max-w-2xl">{persona.backstory}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {persona.contentPillars.map((p) => (
                <span
                  key={p}
                  className="text-xs rounded-full border border-border bg-bg px-2.5 py-1"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <DeleteInfluencerButton influencerId={influencerId} influencerName={name} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Close editor" : "Edit persona"}
            </Button>
            <Link href={`/influencers/${influencerId}/reels/new`}>
              <Button variant="secondary">🎞 New reel</Button>
            </Link>
            <Link href={`/influencers/${influencerId}/studio`}>
              <Button>🎬 New video</Button>
            </Link>
          </div>
        </div>
      </div>

      <PersonaEditor
        influencerId={influencerId}
        initialName={name}
        initialNiche={niche}
        initialPersona={persona}
        initialVoiceRefUrl={voiceRefUrl}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}
