"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

type Mode = "draft" | "standard" | "premium";

type Scene = {
  visualDirection: string;
  durationSec: 5 | 8;
  sourceImageId?: string;
};

const MODE_INFO: Record<Mode, { label: string; perScene: number }> = {
  draft: { label: "Draft", perScene: 0.05 },
  standard: { label: "Standard", perScene: 0.2 },
  premium: { label: "Premium", perScene: 0.4 },
};

export function NewReelClient({
  influencerId,
  gallery,
}: {
  influencerId: string;
  gallery: { id: string; url: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [globalCaption, setGlobalCaption] = useState("");
  const [fullScript, setFullScript] = useState("");
  const [mode, setMode] = useState<Mode>("standard");
  const [scenes, setScenes] = useState<Scene[]>([
    { visualDirection: "", durationSec: 5 },
    { visualDirection: "", durationSec: 5 },
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
    setScenes([...scenes, { visualDirection: "", durationSec: 5 }]);
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
          <div className="text-xs text-muted mt-1.5">
            ≈ {Math.round(fullScript.split(/\s+/).filter(Boolean).length / 2.5)}s spoken at a
            natural pace. Aim for ≤ total scene length ({totalSeconds}s) — anything longer gets
            cut off by ffmpeg <span className="font-mono">-shortest</span>.
          </div>
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Scenes</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addScene} disabled={scenes.length >= 10}>
            + Add scene
          </Button>
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

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">Duration</span>
              {[5, 8].map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setScene(i, { durationSec: d as 5 | 8 })}
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

            {gallery.length > 0 && (
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
