"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { JobProgress } from "@/components/JobProgress";

type Asset = {
  id: string;
  kind: "image" | "video" | "audio";
  url: string;
  meta: Record<string, unknown> | null;
};

export function InfluencerClient({
  influencerId,
  canonicalImageId,
  initialImages,
  initialVideos,
}: {
  influencerId: string;
  canonicalImageId: string | null;
  initialImages: Asset[];
  initialVideos: Asset[];
}) {
  const router = useRouter();
  const [images, setImages] = useState(initialImages);
  const [videos, setVideos] = useState(initialVideos);
  const [canonicalId, setCanonicalId] = useState(canonicalImageId);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [scenePrompt, setScenePrompt] = useState("");
  const [outfit, setOutfit] = useState("");
  const [pose, setPose] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [engine, setEngine] = useState<"face-lock" | "seedream" | "flux-pro" | "recraft">(
    "face-lock",
  );

  // Poll until we have BOTH at least one image AND a canonical id. The
  // starter pack writes images progressively and only sets canonical at the
  // very end; if we stop polling on first image we miss the canonical update.
  useEffect(() => {
    if (images.length > 0 && canonicalId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/influencers/${influencerId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        images: Asset[];
        videos: Asset[];
        influencer: { canonicalImageId: string | null };
      };
      if (data.images.length > 0) setImages(data.images);
      if (data.videos.length > 0) setVideos(data.videos);
      if (data.influencer.canonicalImageId) {
        setCanonicalId(data.influencer.canonicalImageId);
      }
      if (data.images.length > 0 && data.influencer.canonicalImageId) {
        clearInterval(t);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [images.length, canonicalId, influencerId]);

  async function setCanonical(assetId: string) {
    setCanonicalId(assetId);
    await fetch(`/api/influencers/${influencerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canonicalImageId: assetId }),
    });
    router.refresh();
  }

  async function generateMore() {
    if (!scenePrompt.trim()) return;
    const res = await fetch("/api/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        influencerId,
        scenes: [
          {
            scene: scenePrompt,
            outfit: outfit.trim() || undefined,
            pose: pose.trim() || undefined,
          },
        ],
        // Face-lock requires the canonical reference; the other engines
        // generate from the visualPrompt only and can't accept references.
        useCanonicalAsReference: engine === "face-lock",
        engine,
      }),
    });
    const { jobId } = (await res.json()) as { jobId: string };
    setActiveJobId(jobId);
    setScenePrompt("");
    setOutfit("");
    setPose("");
  }

  const ENGINE_INFO = {
    "face-lock": {
      label: "Face lock",
      desc: "Flux + PuLID. Pixel-locks the canonical face. Best for character consistency, weakest at clothing graphics.",
    },
    seedream: {
      label: "Seedream",
      desc: "ByteDance Seedream 4. Strongest for text/logos on clothing. Face only resembles canonical via prompt.",
    },
    "flux-pro": {
      label: "Flux Pro",
      desc: "Flux 1.1 Pro Ultra. Highest realism, best lighting/composition. No face lock.",
    },
    recraft: {
      label: "Recraft",
      desc: "Recraft V3. Specifically tuned for accurate text rendering. No face lock.",
    },
  } as const;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-xl font-semibold">Identity</h2>
          {canonicalId && (
            <span className="text-xs text-muted">
              Selected canonical image is used for video face consistency.
            </span>
          )}
        </div>

        {images.length === 0 ? (
          <div className="rounded-xl border border-border bg-panel p-8 text-center text-muted text-sm">
            Starter image pack is rendering… (4 reference shots)
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => setCanonical(img.id)}
                className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                  canonicalId === img.id ? "border-accent" : "border-transparent hover:border-border"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="aspect-[9/16] w-full object-cover" />
                {canonicalId === img.id && (
                  <div className="absolute top-2 right-2 text-xs bg-accent text-white px-2 py-0.5 rounded">
                    canonical
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <div className="flex gap-2">
            <input
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder="describe a scene — e.g. 'on a Tokyo street at night, neon reflections, shot from low angle'"
              className="flex-1 h-11 rounded-md border border-border bg-panel px-3 text-sm focus:border-accent outline-none"
            />
            <Button
              onClick={generateMore}
              disabled={!scenePrompt.trim() || (engine === "face-lock" && !canonicalId)}
            >
              Generate
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(ENGINE_INFO) as Array<keyof typeof ENGINE_INFO>).map((e) => (
              <button
                key={e}
                onClick={() => setEngine(e)}
                title={ENGINE_INFO[e].desc}
                className={`text-left rounded-md border px-3 py-2 text-xs transition-colors ${
                  engine === e ? "border-accent bg-accent/10" : "border-border hover:bg-border/40"
                }`}
              >
                <div className="font-medium">{ENGINE_INFO[e].label}</div>
                <div className="text-muted leading-snug mt-0.5 line-clamp-2">
                  {ENGINE_INFO[e].desc}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="text-xs text-muted hover:text-text"
          >
            {advancedOpen ? "− hide" : "+ outfit & pose"}
          </button>
          {advancedOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={outfit}
                onChange={(e) => setOutfit(e.target.value)}
                placeholder="outfit — e.g. 'oversized cream knit sweater, vintage jeans'"
                className="h-10 rounded-md border border-border bg-panel px-3 text-sm focus:border-accent outline-none"
              />
              <input
                value={pose}
                onChange={(e) => setPose(e.target.value)}
                placeholder="pose / expression — e.g. 'mid-laugh, hand brushing hair'"
                className="h-10 rounded-md border border-border bg-panel px-3 text-sm focus:border-accent outline-none"
              />
            </div>
          )}
          {engine === "face-lock" && !canonicalId ? (
            <div className="text-xs text-muted">
              Pick a canonical face above first — Face-lock needs it.
            </div>
          ) : engine !== "face-lock" ? (
            <div className="text-xs text-muted">
              {ENGINE_INFO[engine].label}: face won&apos;t be pixel-locked, but the visual prompt
              keeps it &ldquo;in the family.&rdquo; Best for shots with text/graphics on clothing
              or specific photographic looks.
            </div>
          ) : (
            <div className="text-xs text-muted">
              Tip: be cinematic and specific (framing, lighting, time of day, lens). Generic
              prompts produce generic outputs.
            </div>
          )}
        </div>

        {activeJobId && (
          <div className="mt-4 rounded-lg border border-border bg-panel p-4">
            <JobProgress
              jobId={activeJobId}
              onDone={async () => {
                setActiveJobId(null);
                const res = await fetch(`/api/influencers/${influencerId}`);
                const data = (await res.json()) as { images: Asset[] };
                setImages(data.images);
              }}
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Videos</h2>
        {videos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted text-sm">
            No videos yet. Open the studio to record your first clip.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((v) => (
              <div key={v.id} className="rounded-xl overflow-hidden border border-border bg-panel">
                <video src={v.url} controls className="aspect-[9/16] w-full bg-black" />
                <div className="p-3 text-xs text-muted truncate">
                  {(v.meta as { topic?: string } | null)?.topic ?? "untitled"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
