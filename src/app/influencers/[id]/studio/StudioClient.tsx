"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { JobProgress } from "@/components/JobProgress";

type Mode = "draft" | "standard" | "premium";
type ScriptMode = "auto" | "custom";
type ShotMix = "talking" | "mixed" | "travel";

const SHOT_MIX_INFO: Record<ShotMix, { label: string; desc: string }> = {
  talking: { label: "Talking head", desc: "Every beat is the influencer on camera" },
  mixed: { label: "Mixed", desc: "Roughly 50/50 subject + B-roll" },
  travel: { label: "Travel B-roll", desc: "~30% subject + 70% scenery & detail" },
};

type VideoOutput = {
  assetId: string;
  url: string;
  script: { hook: string; spokenLine: string; captionText: string; hashtags: string[] };
  mode?: Mode;
  skipped?: string[];
  variants?: { assetId: string; url: string }[];
  // Story / reel output (multi-beat stitched single video)
  sceneCount?: number;
  storyId?: string;
};

const MODE_INFO: Record<Mode, { label: string; perClip: number; desc: string }> = {
  draft: { label: "Draft", perClip: 0.05, desc: "Flux schnell + LTX-Video — fast, iteration-friendly" },
  standard: { label: "Standard", perClip: 0.2, desc: "Flux dev + Kling 1.6 — current default" },
  premium: { label: "Premium", perClip: 0.4, desc: "Flux dev + Wan-pro — slowest, highest fidelity" },
};

export function StudioClient({
  influencerId,
  hasCanonical,
  galleryImages,
}: {
  influencerId: string;
  hasCanonical: boolean;
  galleryImages: { id: string; url: string }[];
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<5 | 8>(5);
  const [mode, setMode] = useState<Mode>("standard");
  const [variantCount, setVariantCount] = useState(1);
  const [shotMix, setShotMix] = useState<ShotMix>("mixed");
  const [scriptMode, setScriptMode] = useState<ScriptMode>("auto");
  const [sourceImageId, setSourceImageId] = useState<string | null>(null);
  const [custom, setCustom] = useState({
    spokenLine: "",
    captionText: "",
    hashtags: "",
    visualDirection: "",
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [output, setOutput] = useState<VideoOutput | null>(null);

  // Rough split: keyframe ~30%, animation ~70% of per-clip cost. When the
  // user provides their own keyframe, only the animation step runs per variant.
  const perClip = MODE_INFO[mode].perClip;
  const estCost = sourceImageId
    ? perClip * 0.7 * variantCount
    : perClip * variantCount;

  const customValid =
    custom.captionText.trim().length > 0 && custom.visualDirection.trim().length > 0;

  const canSubmit =
    !!hasCanonical &&
    !jobId &&
    (scriptMode === "auto" ? topic.trim().length > 0 : customValid);

  async function go() {
    setOutput(null);
    const body: Record<string, unknown> = {
      influencerId,
      topic: scriptMode === "auto" ? topic : custom.visualDirection.slice(0, 80),
      durationSec: duration,
      mode,
      variantCount,
      shotMix,
      sourceImageId: sourceImageId ?? undefined,
    };
    if (scriptMode === "custom") {
      body.customScript = {
        spokenLine: custom.spokenLine.trim() || undefined,
        captionText: custom.captionText.trim(),
        visualDirection: custom.visualDirection.trim(),
        hashtags: custom.hashtags
          .split(/[\s,#]+/)
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean),
      };
    }
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { jobId: string; storyId?: string; kind?: "video" | "reel" };
    setJobId(data.jobId);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-panel p-5 space-y-5">
        {/* Script mode tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-bg/60 border border-border w-fit">
          {(["auto", "custom"] as ScriptMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setScriptMode(m);
                if (m === "custom") setVariantCount(1);
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                scriptMode === m ? "bg-panel text-text" : "text-muted hover:text-text"
              }`}
            >
              {m === "auto" ? "Topic → Claude writes it" : "Write it myself"}
            </button>
          ))}
        </div>

        {scriptMode === "auto" ? (
          <label className="block">
            <div className="text-sm font-medium mb-1.5">Topic</div>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              placeholder="the one product I tell everyone to buy under $20"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent outline-none resize-none"
            />
            <div className="text-xs text-muted mt-1.5">
              Claude writes the spoken line, caption, hashtags, and visual direction.
            </div>
          </label>
        ) : (
          <div className="space-y-3">
            <Field
              label="Visual direction"
              hint="What we see — framing, lighting, micro-action. The more cinematic, the better the animation."
            >
              <textarea
                value={custom.visualDirection}
                onChange={(e) => setCustom({ ...custom, visualDirection: e.target.value })}
                rows={3}
                placeholder="mid-laugh, hand running through hair, late afternoon sun through a linen curtain, slight shift in weight, 35mm shallow depth of field"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent outline-none resize-none"
              />
            </Field>
            <Field label="Spoken line (optional)" hint="What the influencer says. Leave blank for silent.">
              <textarea
                value={custom.spokenLine}
                onChange={(e) => setCustom({ ...custom, spokenLine: e.target.value })}
                rows={2}
                placeholder="ok the lighting in here is unreal right now"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent outline-none resize-none"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Caption" hint="The text burned over the video.">
                <input
                  value={custom.captionText}
                  onChange={(e) => setCustom({ ...custom, captionText: e.target.value })}
                  placeholder="lisbon at 6pm hits different"
                  className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
                />
              </Field>
              <Field label="Hashtags" hint="Comma or space-separated, no #.">
                <input
                  value={custom.hashtags}
                  onChange={(e) => setCustom({ ...custom, hashtags: e.target.value })}
                  placeholder="lisbon goldenhour slowliving"
                  className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
                />
              </Field>
            </div>
          </div>
        )}

        {galleryImages.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-medium">Keyframe</span>
              <span className="text-xs text-muted">
                Pick an existing image to animate, or auto-generate one (saves 1 image gen step).
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSourceImageId(null)}
                className={`shrink-0 w-20 aspect-[9/16] rounded-md border-2 grid place-items-center text-xs text-center px-1 transition-colors ${
                  sourceImageId === null
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted"
                }`}
              >
                Auto-generate
              </button>
              {galleryImages.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSourceImageId(img.id)}
                  className={`shrink-0 w-20 aspect-[9/16] rounded-md overflow-hidden border-2 transition-colors ${
                    sourceImageId === img.id
                      ? "border-accent"
                      : "border-transparent hover:border-muted"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            {sourceImageId && (
              <div className="text-xs text-muted mt-1.5">
                Quality / engine pickers below are ignored when using an existing image — only
                the animation step runs.
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-sm font-medium mb-1.5">Quality</div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-left rounded-md border p-3 transition-colors ${
                  mode === m ? "border-accent bg-accent/10" : "border-border hover:bg-border/40"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">{MODE_INFO[m].label}</span>
                  <span className="text-xs text-muted tabular-nums">
                    ~${MODE_INFO[m].perClip.toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-muted mt-1 leading-snug">{MODE_INFO[m].desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-sm font-medium mb-1.5">Duration</div>
            <div className="flex items-center gap-2">
              {[5, 8].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d as 5 | 8)}
                  className={`h-9 px-3 text-sm rounded-md border transition-colors ${
                    duration === d ? "border-accent bg-accent/15" : "border-border hover:bg-border/40"
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-1.5">
              Beats
              <span className="ml-2 text-xs text-muted font-normal">
                (≥2 = sequential reel, auto-stitched)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {[1, 3, 5].map((n) => {
                const disabled = scriptMode === "custom" && n > 1;
                return (
                  <button
                    key={n}
                    onClick={() => setVariantCount(n)}
                    disabled={disabled}
                    title={
                      disabled
                        ? "Multi-beat needs auto mode (Claude plans the sequence). For custom multi-scene, use the Reels feature."
                        : undefined
                    }
                    className={`h-9 px-3 text-sm rounded-md border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      variantCount === n
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-border/40"
                    }`}
                  >
                    ×{n}
                  </button>
                );
              })}
            </div>
          </div>
          {variantCount > 1 && scriptMode === "auto" && (
            <div>
              <div className="text-sm font-medium mb-1.5">Shot mix</div>
              <div className="flex items-center gap-2 flex-wrap">
                {(Object.keys(SHOT_MIX_INFO) as ShotMix[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setShotMix(m)}
                    title={SHOT_MIX_INFO[m].desc}
                    className={`h-9 px-3 text-sm rounded-md border transition-colors ${
                      shotMix === m
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-border/40"
                    }`}
                  >
                    {SHOT_MIX_INFO[m].label}
                  </button>
                ))}
              </div>
              <div className="text-xs text-muted mt-1.5">{SHOT_MIX_INFO[shotMix].desc}</div>
            </div>
          )}
          <div className="ml-auto text-right">
            <div className="text-xs text-muted">Estimated cost</div>
            <div className="text-lg font-medium tabular-nums">~${estCost.toFixed(2)}</div>
          </div>
        </div>

        <Button onClick={go} disabled={!canSubmit} size="lg" className="w-full">
          {jobId
            ? "Generating…"
            : variantCount > 1
              ? `Generate ${variantCount} variants`
              : "Generate video"}
        </Button>
        {!hasCanonical && (
          <div className="text-xs text-muted">
            Pick a canonical image on the influencer page first — it locks the face for video.
          </div>
        )}
      </div>

      {jobId && (
        <div className="rounded-xl border border-border bg-panel p-5">
          <JobProgress
            jobId={jobId}
            onDone={(out) => {
              setOutput(out as VideoOutput);
              setJobId(null);
              router.refresh();
            }}
          />
        </div>
      )}

      {output && (
        <div className="rounded-xl border border-border bg-panel overflow-hidden">
          <video src={output.url} controls autoPlay className="aspect-[9/16] w-full bg-black" />
          {output.sceneCount && output.sceneCount > 1 && (
            <div className="bg-accent/10 border-b border-accent/30 px-4 py-2 text-xs flex items-center justify-between">
              <span>
                Stitched reel · {output.sceneCount} beats · saved as a Reel for further edits
              </span>
              {output.storyId && (
                <a
                  href={`/influencers/${influencerId}/reels/${output.storyId}`}
                  className="text-accent hover:underline"
                >
                  open reel →
                </a>
              )}
            </div>
          )}

          <div className="p-5 space-y-3 text-sm">
            {output.script?.spokenLine && (
              <div>
                <div className="text-muted text-xs">Spoken line</div>
                <div>{output.script.spokenLine}</div>
              </div>
            )}
            {output.script?.captionText && (
              <div>
                <div className="text-muted text-xs">Caption</div>
                <div>{output.script.captionText}</div>
              </div>
            )}
            {output.script?.hashtags && output.script.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {output.script.hashtags.map((h) => (
                  <span key={h} className="text-xs text-accent">
                    #{h}
                  </span>
                ))}
              </div>
            )}
            {output.skipped && output.skipped.length > 0 && (
              <div className="text-xs text-muted">Skipped: {output.skipped.join(", ")}</div>
            )}
            <a href={output.url} download className="inline-block">
              <Button variant="secondary" size="sm">⬇ Download MP4</Button>
            </a>
          </div>
        </div>
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
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
