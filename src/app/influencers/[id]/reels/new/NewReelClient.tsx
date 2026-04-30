"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { FormatPicker } from "@/components/FormatPicker";
import { RenderTargetBar } from "@/components/RenderTargetBar";
import { ProductPicker, PRODUCT_FORMATS } from "@/components/ProductPicker";
import type { Format } from "@/lib/formatPresets";
import type { AspectRatio, Quality } from "@/lib/renderTarget";
import type { Product } from "@/lib/db/schema";

type Mode = "draft" | "standard" | "premium";

type ShotType = "subject" | "scenery" | "detail";

type Scene = {
  visualDirection: string;
  durationSec: number;
  sourceImageId?: string;
  shotType: ShotType;
};

const SHOT_INFO: Record<ShotType, { label: string; hint: string }> = {
  subject: { label: "Subject", hint: "the influencer on camera" },
  scenery: { label: "Scenery", hint: "B-roll, no person" },
  detail: { label: "Detail", hint: "macro / cutaway" },
};

const MODE_INFO: Record<Mode, { label: string; perScene: number }> = {
  draft: { label: "Draft", perScene: 0.05 },
  standard: { label: "Standard", perScene: 0.2 },
  premium: { label: "Premium", perScene: 0.4 },
};

export function NewReelClient({
  influencerId,
  gallery,
  defaultFormat,
  products,
}: {
  influencerId: string;
  gallery: { id: string; url: string }[];
  defaultFormat: Format;
  products: Product[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [globalCaption, setGlobalCaption] = useState("");
  const [fullScript, setFullScript] = useState("");
  const [mode, setMode] = useState<Mode>("standard");
  const [format, setFormat] = useState<Format>(defaultFormat);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [quality, setQuality] = useState<Quality>("1080p");
  // Default-length is the canonical scene duration when adding new scenes.
  const [defaultSceneLength, setDefaultSceneLength] = useState<number>(5);
  const [productId, setProductId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([
    { visualDirection: "", durationSec: 5, shotType: "subject" },
    { visualDirection: "", durationSec: 5, shotType: "subject" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalSeconds = scenes.reduce((s, x) => s + x.durationSec, 0);
  const estCost = scenes.reduce((s, scene) => {
    // skipping keyframe = ~70% of per-scene cost
    return s + (scene.sourceImageId ? MODE_INFO[mode].perScene * 0.7 : MODE_INFO[mode].perScene);
  }, 0);

  function setScene(i: number, patch: Partial<Scene>) {
    setScenes(scenes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addScene() {
    if (scenes.length >= 10) return;
    setScenes([
      ...scenes,
      { visualDirection: "", durationSec: defaultSceneLength, shotType: "subject" },
    ]);
  }

  function applyTravelMix() {
    // Open + close on subject, fill the middle with scenery/detail.
    setScenes(
      scenes.map((s, i) => {
        if (i === 0 || i === scenes.length - 1) return { ...s, shotType: "subject" };
        return { ...s, shotType: i % 2 === 0 ? "scenery" : "detail" };
      }),
    );
  }
  function applyAllSubject() {
    setScenes(scenes.map((s) => ({ ...s, shotType: "subject" })));
  }
  function removeScene(i: number) {
    if (scenes.length <= 1) return;
    setScenes(scenes.filter((_, idx) => idx !== i));
  }
  function moveScene(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= scenes.length) return;
    const copy = [...scenes];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setScenes(copy);
  }

  const canSubmit =
    !busy &&
    title.trim().length > 0 &&
    fullScript.trim().length > 0 &&
    scenes.every((s) => s.visualDirection.trim().length > 0);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          influencerId,
          title: title.trim(),
          globalCaption: globalCaption.trim(),
          fullScript: fullScript.trim(),
          scenes,
          mode,
          format,
          aspectRatio,
          quality,
          productId: productId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = (await res.json()) as { id: string };
      router.push(`/influencers/${influencerId}/reels/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={go} className="space-y-6">
      <div className="rounded-xl border border-border bg-panel p-5 space-y-4">
        <Field label="Title" hint="Just for your own organization.">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="lisbon golden hour walk"
            className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
          />
        </Field>
        <FormatPicker
          value={format}
          onChange={setFormat}
          label="Format"
          hint="Picks the visual + motion + scene-pattern style for this reel."
        />

        {PRODUCT_FORMATS.has(format) && (
          <ProductPicker
            products={products}
            value={productId}
            onChange={setProductId}
            label="Product"
            hint="Detail shots use the product image; Claude works it into the script."
          />
        )}

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-medium">Render target</span>
            <span className="text-xs text-muted">
              Length here = default for newly added scenes; per-scene override below.
            </span>
          </div>
          <RenderTargetBar
            aspectRatio={aspectRatio}
            quality={quality}
            length={defaultSceneLength}
            onAspectChange={setAspectRatio}
            onQualityChange={setQuality}
            onLengthChange={setDefaultSceneLength}
          />
        </div>
        <Field
          label="Persistent caption"
          hint="Burned into every scene. Leave blank for no caption."
        >
          <input
            value={globalCaption}
            onChange={(e) => setGlobalCaption(e.target.value)}
            placeholder="lisbon at 6pm hits different"
            className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
          />
        </Field>
        <Field
          label="Full voiceover script"
          hint="What the influencer says across the entire reel — written as one continuous narration."
        >
          <textarea
            value={fullScript}
            onChange={(e) => setFullScript(e.target.value)}
            rows={5}
            placeholder="ok the way the light hits these tiles at six pm is unreal. i used to walk this exact route every evening when i first moved here. there's a quiet kind of luxury in it — no one's trying to impress anyone, the whole city just exhales."
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent outline-none resize-y"
          />
          <ScriptTimingBadge fullScript={fullScript} sceneTotalSec={totalSeconds} />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Scenes</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyTravelMix}
              className="text-xs px-3 h-8 rounded-md border border-border hover:bg-border/40"
              title="Open + close on subject, scenery/detail in the middle"
            >
              Travel preset
            </button>
            <button
              type="button"
              onClick={applyAllSubject}
              className="text-xs px-3 h-8 rounded-md border border-border hover:bg-border/40"
              title="Every scene is the influencer on camera"
            >
              All subject
            </button>
            <Button type="button" variant="secondary" size="sm" onClick={addScene} disabled={scenes.length >= 10}>
              + Add scene
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted">
          Travel-creator content is roughly 30% subject (the influencer on camera) and 70% scenery
          + detail B-roll. Scenery scenes skip face-lock so landscapes actually render.
        </div>

        {scenes.map((scene, i) => (
          <div key={i} className="rounded-xl border border-border bg-panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Scene {i + 1}</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveScene(i, -1)}
                  disabled={i === 0}
                  className="text-xs text-muted hover:text-text disabled:opacity-30 px-2"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveScene(i, 1)}
                  disabled={i === scenes.length - 1}
                  className="text-xs text-muted hover:text-text disabled:opacity-30 px-2"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeScene(i)}
                  disabled={scenes.length <= 1}
                  className="text-xs text-red-300 hover:text-red-200 disabled:opacity-30 px-2"
                >
                  remove
                </button>
              </div>
            </div>

            <textarea
              value={scene.visualDirection}
              onChange={(e) => setScene(i, { visualDirection: e.target.value })}
              rows={2}
              placeholder="walking past a yellow tram, late afternoon sun, shot from low angle, subtle handheld feel, 35mm shallow DOF"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent outline-none resize-none"
            />

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Shot</span>
                {(Object.keys(SHOT_INFO) as ShotType[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setScene(i, { shotType: t })}
                    title={SHOT_INFO[t].hint}
                    className={`h-7 px-3 text-xs rounded-md border transition-colors ${
                      scene.shotType === t
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-border/40"
                    }`}
                  >
                    {SHOT_INFO[t].label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Duration</span>
                {[5, 8, 10, 12, 15].map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setScene(i, { durationSec: d })}
                    className={`h-7 px-3 text-xs rounded-md border transition-colors ${
                      scene.durationSec === d
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-border/40"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {gallery.length > 0 && scene.shotType === "subject" && (
              <div>
                <div className="text-xs text-muted mb-1.5">
                  Source image (optional — auto-generates a keyframe if not picked)
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setScene(i, { sourceImageId: undefined })}
                    className={`shrink-0 w-16 aspect-[9/16] rounded-md border-2 grid place-items-center text-[10px] text-center px-1 transition-colors ${
                      !scene.sourceImageId
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-muted"
                    }`}
                  >
                    Auto
                  </button>
                  {gallery.map((img) => (
                    <button
                      type="button"
                      key={img.id}
                      onClick={() => setScene(i, { sourceImageId: img.id })}
                      className={`shrink-0 w-16 aspect-[9/16] rounded-md overflow-hidden border-2 transition-colors ${
                        scene.sourceImageId === img.id
                          ? "border-accent"
                          : "border-transparent hover:border-muted"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-panel p-5 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-xs text-muted mb-1">Quality</div>
          <div className="flex gap-2">
            {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMode(m)}
                className={`h-9 px-3 text-sm rounded-md border transition-colors ${
                  mode === m ? "border-accent bg-accent/15" : "border-border hover:bg-border/40"
                }`}
              >
                {MODE_INFO[m].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Total length</div>
          <div className="text-lg font-medium tabular-nums">{totalSeconds}s</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-muted">Estimated cost</div>
          <div className="text-lg font-medium tabular-nums">~${estCost.toFixed(2)}</div>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {err}
        </div>
      )}

      <Button type="submit" disabled={!canSubmit} size="lg" className="w-full">
        {busy ? "Starting…" : "Render reel"}
      </Button>
    </form>
  );
}

function ScriptTimingBadge({
  fullScript,
  sceneTotalSec,
}: {
  fullScript: string;
  sceneTotalSec: number;
}) {
  const words = fullScript.split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    return (
      <div className="text-xs text-muted mt-1.5">
        Aim for the script to play out within the total scene length ({sceneTotalSec}s) — the
        pipeline will hold the last frame to cover any overrun, but matching feels best.
      </div>
    );
  }
  const estimatedSec = words / 2.3; // ~2.3 wps natural read pace
  const diff = estimatedSec - sceneTotalSec;
  const ratio = sceneTotalSec > 0 ? estimatedSec / sceneTotalSec : 0;

  // Bands: green ≈ within 15%, yellow ≈ within 35%, red beyond.
  let tone: "ok" | "warn" | "bad";
  let msg: string;
  if (sceneTotalSec === 0) {
    tone = "warn";
    msg = "Add at least one scene.";
  } else if (Math.abs(diff) <= sceneTotalSec * 0.15) {
    tone = "ok";
    msg = "Script length matches scene total — clean cuts on both ends.";
  } else if (diff > 0 && ratio <= 1.35) {
    tone = "warn";
    msg = `Script is ~${Math.abs(diff).toFixed(1)}s longer than the scenes. The pipeline will hold the last frame to fit, but adding a scene would feel more natural.`;
  } else if (diff > 0) {
    tone = "bad";
    msg = `Script is ~${Math.abs(diff).toFixed(1)}s longer than the scenes — that's a big stretch on the last frame. Add ${Math.ceil(diff / 5)} more scene${Math.ceil(diff / 5) === 1 ? "" : "s"}.`;
  } else if (-diff <= sceneTotalSec * 0.35) {
    tone = "warn";
    msg = `Script is ~${Math.abs(diff).toFixed(1)}s shorter — reel will end with ${Math.abs(diff).toFixed(1)}s of silent video. Trim a scene or expand the script.`;
  } else {
    tone = "bad";
    msg = `Script is ~${Math.abs(diff).toFixed(1)}s shorter than the scenes — long silent tail. Trim ${Math.ceil(-diff / 5)} scene${Math.ceil(-diff / 5) === 1 ? "" : "s"} or expand the script.`;
  }

  const palette =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-red-500/40 bg-red-500/10 text-red-300";

  return (
    <div className={`mt-1.5 rounded-md border px-3 py-2 text-xs ${palette}`}>
      <div className="font-medium tabular-nums">
        {words} words · ≈ {estimatedSec.toFixed(1)}s spoken vs {sceneTotalSec}s of scenes
      </div>
      <div className="opacity-90 mt-0.5">{msg}</div>
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
