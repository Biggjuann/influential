"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import type { Persona, CaptionStyleConfig } from "@/lib/db/schema";
import { AVAILABLE_FONTS } from "@/lib/captionFonts";

const POSITIONS: { id: "top" | "center" | "bottom"; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

const DEFAULT_CAPTION: CaptionStyleConfig = {
  font: "DejaVu Sans",
  fontSize: 64,
  weight: 700,
  italic: false,
  uppercase: false,
  color: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 6,
  position: "top",
  background: null,
  shadow: null,
};

export function PersonaEditor({
  influencerId,
  initialName,
  initialNiche,
  initialPersona,
  initialVoiceRefUrl,
  open: controlledOpen,
  onOpenChange,
}: {
  influencerId: string;
  initialName: string;
  initialNiche: string;
  initialPersona: Persona;
  initialVoiceRefUrl: string | null;
  /** When provided, parent controls visibility; PersonaEditor renders the
   * form-only (no toggle button) and calls onOpenChange for cancel/save. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? !!controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [niche, setNiche] = useState(initialNiche);
  const [p, setP] = useState<Persona>(initialPersona);
  const [voiceRefUrl, setVoiceRefUrl] = useState<string | null>(initialVoiceRefUrl);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const caption: CaptionStyleConfig = { ...DEFAULT_CAPTION, ...(p.captionStyle ?? {}) };
  const setCaption = (patch: Partial<CaptionStyleConfig>) =>
    setP({ ...p, captionStyle: { ...caption, ...patch } });

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

  async function uploadVoice(file: File) {
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/influencers/${influencerId}/voice`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { ok?: boolean; voiceRefUrl?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "upload failed");
      setVoiceRefUrl(data.voiceRefUrl ?? null);
      router.refresh();
    } catch (e) {
      setVoiceErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVoiceBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearVoice() {
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const res = await fetch(`/api/influencers/${influencerId}/voice`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setVoiceRefUrl(null);
      router.refresh();
    } catch (e) {
      setVoiceErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVoiceBusy(false);
    }
  }

  // Controlled mode: parent renders its own button. We just don't render the
  // form when it's closed.
  if (!open) {
    if (isControlled) return null;
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit persona
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Edit persona</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-muted hover:text-text">
          Cancel
        </button>
      </div>

      {/* Identity */}
      <Section title="Identity">
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

        <Field label="Voice description" hint="Tone, pace, accent.">
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
          hint="Locks the look. Face shape, jawline, eye color, hair, skin, build. NO scene/clothing/pose."
        >
          <Textarea
            value={p.visualPrompt}
            onChange={(v) => setP({ ...p, visualPrompt: v })}
            rows={5}
          />
        </Field>

        <Field label="Negative prompt" hint="What to avoid.">
          <Textarea
            value={p.negativePrompt}
            onChange={(v) => setP({ ...p, negativePrompt: v })}
            rows={2}
          />
        </Field>
      </Section>

      {/* Voice cloning */}
      <Section
        title="Voice clone"
        subtitle="Upload a 10-15s clean clip of someone speaking in this persona's voice. F5-TTS clones the timbre + cadence and uses it for every video and reel."
      >
        {voiceRefUrl ? (
          <div className="space-y-2">
            <audio controls src={voiceRefUrl} className="w-full" />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={voiceBusy}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearVoice}
                disabled={voiceBusy}
              >
                {voiceBusy ? "Working…" : "Remove"}
              </Button>
              <span className="text-xs text-muted">
                Clone is active. Reels and studio videos will use this voice.
              </span>
            </div>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={voiceBusy}
            >
              {voiceBusy ? "Uploading…" : "Upload voice clip"}
            </Button>
            <p className="text-xs text-muted mt-2">
              MP3, WAV, M4A, WebM, or OGG. ≤ 25 MB. Without a clone, videos use the default
              ElevenLabs voice (also good but not personalized).
            </p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadVoice(f);
          }}
        />
        {voiceErr && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            {voiceErr}
          </div>
        )}
      </Section>

      {/* Caption style */}
      <Section
        title="Caption style"
        subtitle="Applied to every reel rendered for this influencer. Per-reel overrides come next."
      >
        <CaptionPreview text="lisbon at 6pm hits different" style={caption} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Font">
            <select
              value={caption.font}
              onChange={(e) => setCaption({ font: e.target.value })}
              className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
            >
              {AVAILABLE_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Position">
            <div className="flex gap-2">
              {POSITIONS.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => setCaption({ position: pos.id })}
                  className={`flex-1 h-10 text-sm rounded-md border transition-colors ${
                    caption.position === pos.id
                      ? "border-accent bg-accent/15"
                      : "border-border hover:bg-border/40"
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Size">
            <input
              type="range"
              min={36}
              max={120}
              step={2}
              value={caption.fontSize}
              onChange={(e) => setCaption({ fontSize: Number(e.target.value) })}
              className="w-full"
            />
            <div className="text-xs text-muted">{caption.fontSize}px</div>
          </Field>
          <Field label="Weight">
            <div className="flex gap-2">
              {[400, 600, 700, 800].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setCaption({ weight: w as 400 | 600 | 700 | 800 })}
                  className={`flex-1 h-10 text-xs rounded-md border transition-colors ${
                    caption.weight === w
                      ? "border-accent bg-accent/15"
                      : "border-border hover:bg-border/40"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Text color">
            <ColorInput value={caption.color ?? "#ffffff"} onChange={(v) => setCaption({ color: v })} />
          </Field>
          <Field label="Outline color">
            <ColorInput
              value={caption.strokeColor ?? "#000000"}
              onChange={(v) => setCaption({ strokeColor: v })}
            />
          </Field>
          <Field label="Outline width">
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={caption.strokeWidth ?? 0}
              onChange={(e) => setCaption({ strokeWidth: Number(e.target.value) })}
              className="w-full"
            />
            <div className="text-xs text-muted">{caption.strokeWidth ?? 0}px</div>
          </Field>
          <Field label="Style toggles">
            <div className="flex gap-2">
              <Toggle
                label="Italic"
                value={!!caption.italic}
                onChange={(v) => setCaption({ italic: v })}
              />
              <Toggle
                label="ALL CAPS"
                value={!!caption.uppercase}
                onChange={(v) => setCaption({ uppercase: v })}
              />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Section title="Background box" subtitle="Translucent rectangle behind the text.">
            <div className="flex items-center gap-3">
              <Toggle
                label="Enabled"
                value={!!caption.background}
                onChange={(v) =>
                  setCaption({
                    background: v
                      ? { color: "#000000", opacity: 0.55, paddingX: 32, paddingY: 18, radius: 14 }
                      : null,
                  })
                }
              />
            </div>
            {caption.background && (
              <div className="space-y-2">
                <Field label="Color">
                  <ColorInput
                    value={caption.background.color ?? "#000000"}
                    onChange={(v) =>
                      setCaption({ background: { ...caption.background, color: v } })
                    }
                  />
                </Field>
                <Field label="Opacity">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={caption.background.opacity ?? 0.55}
                    onChange={(e) =>
                      setCaption({
                        background: { ...caption.background, opacity: Number(e.target.value) },
                      })
                    }
                    className="w-full"
                  />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Drop shadow" subtitle="Soft shadow under the text.">
            <div className="flex items-center gap-3">
              <Toggle
                label="Enabled"
                value={!!caption.shadow}
                onChange={(v) =>
                  setCaption({
                    shadow: v
                      ? { offsetX: 0, offsetY: 4, blur: 6, color: "#000000", opacity: 0.6 }
                      : null,
                  })
                }
              />
            </div>
            {caption.shadow && (
              <div className="space-y-2">
                <Field label="Blur">
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={caption.shadow.blur ?? 6}
                    onChange={(e) =>
                      setCaption({
                        shadow: { ...caption.shadow, blur: Number(e.target.value) },
                      })
                    }
                    className="w-full"
                  />
                </Field>
                <Field label="Y offset">
                  <input
                    type="range"
                    min={-12}
                    max={20}
                    step={1}
                    value={caption.shadow.offsetY ?? 4}
                    onChange={(e) =>
                      setCaption({
                        shadow: { ...caption.shadow, offsetY: Number(e.target.value) },
                      })
                    }
                    className="w-full"
                  />
                </Field>
              </div>
            )}
          </Section>
        </div>
      </Section>

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
        Note: changes apply to NEW images, videos, and reels. Existing assets keep what they were
        rendered with.
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 p-4 space-y-3">
      <div>
        <div className="font-medium">{title}</div>
        {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
      </div>
      {children}
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

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 rounded border border-border bg-bg cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-10 rounded-md border border-border bg-bg px-3 text-sm font-mono focus:border-accent outline-none"
      />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`h-10 px-3 text-xs rounded-md border transition-colors ${
        value ? "border-accent bg-accent/15" : "border-border hover:bg-border/40"
      }`}
    >
      {label}
    </button>
  );
}

function CaptionPreview({ text, style }: { text: string; style: CaptionStyleConfig }) {
  // Live HTML/CSS approximation of how the caption will render. Not pixel
  // identical (we render via SVG + sharp server-side) but close enough for
  // tuning font / size / position / colors before a render.
  const containerH = 320;
  const verticalAlign =
    style.position === "bottom"
      ? "items-end"
      : style.position === "center"
        ? "items-center"
        : "items-start";

  const display = style.uppercase ? text.toUpperCase() : text;
  const stroke = style.strokeWidth ?? 0;
  const sw = stroke;
  const sc = style.strokeColor ?? "#000";
  const textShadow =
    sw > 0
      ? `${[`-${sw}px -${sw}px 0 ${sc}`, `${sw}px -${sw}px 0 ${sc}`, `-${sw}px ${sw}px 0 ${sc}`, `${sw}px ${sw}px 0 ${sc}`].join(", ")}`
      : "none";

  return (
    <div
      className={`relative rounded-lg overflow-hidden border border-border bg-gradient-to-br from-zinc-700 to-zinc-900 flex justify-center px-6 py-6 ${verticalAlign}`}
      style={{ height: containerH }}
    >
      <div
        className="text-center max-w-full"
        style={{
          fontFamily: `'${style.font ?? "DejaVu Sans"}', sans-serif`,
          fontWeight: style.weight ?? 700,
          fontStyle: style.italic ? "italic" : "normal",
          fontSize: Math.round((style.fontSize ?? 64) * 0.45),
          color: style.color ?? "#fff",
          textShadow,
          padding: style.background
            ? `${(style.background.paddingY ?? 18) * 0.45}px ${(style.background.paddingX ?? 32) * 0.45}px`
            : 0,
          background: style.background
            ? hexWithAlpha(style.background.color ?? "#000", style.background.opacity ?? 0.55)
            : "transparent",
          borderRadius: style.background ? (style.background.radius ?? 14) * 0.45 : 0,
          filter: style.shadow
            ? `drop-shadow(${style.shadow.offsetX ?? 0}px ${style.shadow.offsetY ?? 4}px ${style.shadow.blur ?? 6}px ${hexWithAlpha(style.shadow.color ?? "#000", style.shadow.opacity ?? 0.55)})`
            : "none",
          lineHeight: 1.15,
        }}
      >
        {display}
      </div>
      <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider text-white/50">
        live preview
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  if (Number.isNaN(r)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
