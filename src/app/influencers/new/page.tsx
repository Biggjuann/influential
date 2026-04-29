"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

type Mode = "auto" | "manual";

export default function NewInfluencer() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("auto");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto mode
  const [niche, setNiche] = useState("");
  const [vibe, setVibe] = useState("");
  const [gender, setGender] = useState("");

  // Manual mode
  const [m, setM] = useState({
    name: "",
    niche: "",
    age: "26",
    ethnicity: "",
    hair: "",
    eyes: "",
    build: "",
    style: "",
    backstory: "",
    voiceDescription: "",
    contentPillars: "",
    visualPrompt: "",
    negativePrompt: "cartoon, anime, illustration, plastic skin, deformed, watermark, text",
  });

  async function submitAuto(e: React.FormEvent) {
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

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const persona = {
        name: m.name,
        age: Number(m.age) || 26,
        ethnicity: m.ethnicity,
        hair: m.hair,
        eyes: m.eyes,
        build: m.build,
        style: m.style,
        backstory: m.backstory,
        voiceDescription: m.voiceDescription,
        contentPillars: m.contentPillars
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        visualPrompt: m.visualPrompt,
        negativePrompt: m.negativePrompt,
      };
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ niche: m.niche, manualPersona: persona }),
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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">New influencer</h1>
      <p className="text-muted mb-6">
        Either describe a niche and let Claude design the persona, or write every detail yourself
        for full creative control.
      </p>

      <div className="flex gap-1 p-1 rounded-lg bg-panel border border-border w-fit mb-6">
        {(["auto", "manual"] as Mode[]).map((x) => (
          <button
            key={x}
            onClick={() => setMode(x)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              mode === x ? "bg-bg text-text" : "text-muted hover:text-text"
            }`}
          >
            {x === "auto" ? "Auto (Claude designs)" : "Manual (I write everything)"}
          </button>
        ))}
      </div>

      {mode === "auto" ? (
        <form onSubmit={submitAuto} className="space-y-5">
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

          {err && <ErrBox msg={err} />}

          <Button type="submit" disabled={busy || !niche} size="lg" className="w-full">
            {busy ? "Designing persona…" : "Generate influencer"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitManual} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name">
              <I value={m.name} on={(v) => setM({ ...m, name: v })} required placeholder="Aria Vale" />
            </Field>
            <Field label="Niche">
              <I value={m.niche} on={(v) => setM({ ...m, niche: v })} required placeholder="slow travel" />
            </Field>
            <Field label="Age">
              <I value={m.age} on={(v) => setM({ ...m, age: v })} placeholder="26" />
            </Field>
            <Field label="Ethnicity">
              <I value={m.ethnicity} on={(v) => setM({ ...m, ethnicity: v })} placeholder="mixed European / East Asian" />
            </Field>
            <Field label="Hair">
              <I value={m.hair} on={(v) => setM({ ...m, hair: v })} placeholder="long wavy auburn" />
            </Field>
            <Field label="Eyes">
              <I value={m.eyes} on={(v) => setM({ ...m, eyes: v })} placeholder="warm hazel almond" />
            </Field>
            <Field label="Build">
              <I value={m.build} on={(v) => setM({ ...m, build: v })} placeholder="petite, athletic" />
            </Field>
            <Field label="Style">
              <I value={m.style} on={(v) => setM({ ...m, style: v })} placeholder="soft minimalist with vintage accents" />
            </Field>
          </div>

          <Field label="Backstory" hint="2-3 sentences about who they are.">
            <T value={m.backstory} on={(v) => setM({ ...m, backstory: v })} rows={3} placeholder="A slow-travel creator based in Lisbon..." />
          </Field>

          <Field label="Voice description" hint="Tone, pace, accent — drives TTS and Claude scripting.">
            <T value={m.voiceDescription} on={(v) => setM({ ...m, voiceDescription: v })} rows={2} placeholder="warm, low-pitched, unhurried, slight transatlantic drift" />
          </Field>

          <Field label="Content pillars" hint="Comma-separated, 3-5 items.">
            <I value={m.contentPillars} on={(v) => setM({ ...m, contentPillars: v })} placeholder="slow travel, quiet luxury, honest reviews, lisbon" />
          </Field>

          <Field
            label="Visual prompt"
            hint="THE most important field. Lock the look here: face shape, jawline, eye shape & color, hair color/length/style, skin, build. Append photorealistic style cues. NO scene, clothing, or pose — those vary per shot."
          >
            <T
              value={m.visualPrompt}
              on={(v) => setM({ ...m, visualPrompt: v })}
              rows={5}
              placeholder="portrait of a 26-year-old woman, mixed European and East Asian, oval face with high cheekbones, defined jawline, warm hazel almond eyes, long wavy auburn hair, fair skin with light freckles, petite athletic build, photorealistic, 35mm photo, soft natural light, sharp focus, skin texture detail"
              required
            />
          </Field>

          <Field label="Negative prompt" hint="What to avoid.">
            <T value={m.negativePrompt} on={(v) => setM({ ...m, negativePrompt: v })} rows={2} />
          </Field>

          {err && <ErrBox msg={err} />}

          <Button
            type="submit"
            disabled={busy || !m.name || !m.niche || !m.visualPrompt}
            size="lg"
            className="w-full"
          >
            {busy ? "Creating…" : "Create influencer"}
          </Button>
        </form>
      )}
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
        {hint && <span className="text-xs text-muted ml-3 text-right">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function I(props: {
  value: string;
  on: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.on(e.target.value)}
      placeholder={props.placeholder}
      required={props.required}
      className="w-full h-10 rounded-md border border-border bg-panel px-3 text-sm focus:border-accent outline-none"
    />
  );
}

function T(props: {
  value: string;
  on: (v: string) => void;
  rows: number;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <textarea
      value={props.value}
      onChange={(e) => props.on(e.target.value)}
      rows={props.rows}
      placeholder={props.placeholder}
      required={props.required}
      className="w-full rounded-md border border-border bg-panel px-3 py-2 text-sm focus:border-accent outline-none resize-y"
    />
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
      {msg}
    </div>
  );
}
