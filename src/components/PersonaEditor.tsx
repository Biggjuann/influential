"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import type { Persona } from "@/lib/db/schema";

export function PersonaEditor({
  influencerId,
  initialName,
  initialNiche,
  initialPersona,
}: {
  influencerId: string;
  initialName: string;
  initialNiche: string;
  initialPersona: Persona;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [niche, setNiche] = useState(initialNiche);
  const [p, setP] = useState<Persona>(initialPersona);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/influencers/${influencerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, niche, persona: p }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit persona
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Edit persona</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-muted hover:text-text">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={setName} />
        </Field>
        <Field label="Niche">
          <Input value={niche} onChange={setNiche} />
        </Field>
        <Field label="Age">
          <Input
            value={String(p.age)}
            onChange={(v) => setP({ ...p, age: Number(v) || p.age })}
          />
        </Field>
        <Field label="Ethnicity">
          <Input value={p.ethnicity} onChange={(v) => setP({ ...p, ethnicity: v })} />
        </Field>
        <Field label="Hair">
          <Input value={p.hair} onChange={(v) => setP({ ...p, hair: v })} />
        </Field>
        <Field label="Eyes">
          <Input value={p.eyes} onChange={(v) => setP({ ...p, eyes: v })} />
        </Field>
        <Field label="Build">
          <Input value={p.build} onChange={(v) => setP({ ...p, build: v })} />
        </Field>
        <Field label="Style">
          <Input value={p.style} onChange={(v) => setP({ ...p, style: v })} />
        </Field>
      </div>

      <Field label="Backstory">
        <Textarea value={p.backstory} onChange={(v) => setP({ ...p, backstory: v })} rows={3} />
      </Field>

      <Field label="Voice description" hint="Tone, pace, accent — used by TTS and shown to Claude when scripting.">
        <Textarea
          value={p.voiceDescription}
          onChange={(v) => setP({ ...p, voiceDescription: v })}
          rows={2}
        />
      </Field>

      <Field label="Content pillars" hint="Comma-separated, 3-5 items.">
        <Input
          value={p.contentPillars.join(", ")}
          onChange={(v) =>
            setP({
              ...p,
              contentPillars: v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>

      <Field
        label="Visual prompt"
        hint="The most important field — locks the character's look across all images. Append-only details (face shape, jawline, eye color, hair, skin, build), end with photorealistic style cues. NO scene/clothing/pose."
      >
        <Textarea
          value={p.visualPrompt}
          onChange={(v) => setP({ ...p, visualPrompt: v })}
          rows={5}
        />
      </Field>

      <Field label="Negative prompt" hint="What to avoid. Comma-separated.">
        <Textarea
          value={p.negativePrompt}
          onChange={(v) => setP({ ...p, negativePrompt: v })}
          rows={2}
        />
      </Field>

      {err && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {err}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="text-xs text-muted">
        Note: changes apply to NEW images and videos. Existing assets keep the look they were
        generated with.
      </div>
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

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
    />
  );
}

function Textarea({
  value,
  onChange,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent outline-none resize-y"
    />
  );
}
