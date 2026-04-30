"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { JobProgress } from "@/components/JobProgress";

export function ReelDetailClient({
  storyId,
  initialStatus,
  initialJobId,
  initialVideoUrl,
}: {
  storyId: string;
  initialStatus: "queued" | "rendering" | "done" | "error";
  initialJobId: string | null;
  initialVideoUrl: string | null;
}) {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [status, setStatus] = useState(initialStatus);

  // After a render finishes, fetch the freshly-attached video URL.
  useEffect(() => {
    if (status === "done" && !videoUrl) {
      void (async () => {
        const res = await fetch(`/api/stories/${storyId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { output: { url: string } | null };
        if (data.output?.url) setVideoUrl(data.output.url);
      })();
    }
  }, [status, videoUrl, storyId]);

  if (status === "error") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        Render failed. Check the Persona JSON below or retry from a fresh reel.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {videoUrl ? (
        <video src={videoUrl} controls autoPlay className="aspect-[9/16] w-full bg-black rounded-xl" />
      ) : initialJobId ? (
        <div className="rounded-xl border border-border bg-panel p-5">
          <JobProgress
            jobId={initialJobId}
            onDone={() => {
              setStatus("done");
              router.refresh();
            }}
          />
          <div className="text-xs text-muted mt-3">
            Reels take longer than single videos — keyframe + animation per scene, then voiceover,
            stitching, and caption overlay. Roughly (scenes × 60s) + 30s.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-panel p-5 text-sm text-muted">
          No render in progress. Status: {status}.
        </div>
      )}

      {videoUrl && (
        <a href={videoUrl} download className="inline-block">
          <Button variant="secondary" size="sm">⬇ Download MP4</Button>
        </a>
      )}
    </div>
  );
}
