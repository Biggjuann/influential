"use client";
import { useEffect, useState } from "react";

type Job = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  step: string | null;
  error: string | null;
  output: unknown;
  createdAt?: number;
  updatedAt?: number;
};

export function JobProgress({
  jobId,
  onDone,
}: {
  jobId: string;
  onDone?: (output: unknown) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stopped = false;
    async function poll() {
      while (!stopped) {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) break;
        const { job: j } = (await res.json()) as { job: Job };
        setJob(j);
        if (j.status === "done") {
          onDone?.(j.output);
          break;
        }
        if (j.status === "error") break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    poll();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(tick);
    };
  }, [jobId, onDone]);

  if (!job) return <div className="text-muted text-sm">starting…</div>;

  if (job.status === "error") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 space-y-1">
        <div className="font-medium">Generation failed</div>
        <div className="font-mono text-xs whitespace-pre-wrap break-words">
          {job.error ?? "unknown error"}
        </div>
      </div>
    );
  }

  const elapsed = job.createdAt ? Math.max(0, Math.floor(now / 1000) - job.createdAt) : 0;
  const elapsedText = elapsed > 0 ? `${formatDuration(elapsed)} elapsed` : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{job.step ?? job.status}</span>
        <span className="tabular-nums text-muted">
          {elapsedText ? `${elapsedText} · ` : ""}
          {job.progress}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent2 transition-[width] duration-500"
          style={{ width: `${job.progress}%` }}
        />
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
