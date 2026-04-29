"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { JobProgress } from "@/components/JobProgress";

type VideoOutput = {
  assetId: string;
  url: string;
  script: { hook: string; spokenLine: string; captionText: string; hashtags: string[] };
  skipped?: string[];
};

export function StudioClient({
  influencerId,
  hasCanonical,
}: {
  influencerId: string;
  hasCanonical: boolean;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<5 | 8>(5);
  const [jobId, setJobId] = useState<string | null>(null);
  const [output, setOutput] = useState<VideoOutput | null>(null);

  async function go() {
    setOutput(null);
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ influencerId, topic, durationSec: duration }),
    });
    const { jobId } = (await res.json()) as { jobId: string };
    setJobId(jobId);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-panel p-5 space-y-4">
        <label className="block">
          <div className="text-sm font-medium mb-1.5">Topic</div>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="the one product I tell everyone to buy under $20"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent outline-none resize-none"
          />
        </label>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Duration</span>
          {[5, 8].map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d as 5 | 8)}
              className={`h-8 px-3 text-sm rounded-md border transition-colors ${
                duration === d ? "border-accent bg-accent/15" : "border-border hover:bg-border/40"
              }`}
            >
              {d}s
            </button>
          ))}
        </div>

        <Button onClick={go} disabled={!topic.trim() || !hasCanonical || !!jobId} size="lg" className="w-full">
          {jobId ? "Generating…" : "Generate video"}
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
          <div className="p-5 space-y-3 text-sm">
            <div>
              <div className="text-muted text-xs">Spoken line</div>
              <div>{output.script.spokenLine}</div>
            </div>
            <div>
              <div className="text-muted text-xs">Caption</div>
              <div>{output.script.captionText}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {output.script.hashtags.map((h) => (
                <span key={h} className="text-xs text-accent">
                  #{h}
                </span>
              ))}
            </div>
            {output.skipped && output.skipped.length > 0 && (
              <div className="text-xs text-muted">
                Skipped: {output.skipped.join(", ")}
              </div>
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
