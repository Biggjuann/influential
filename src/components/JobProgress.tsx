"use client";
import { useEffect, useState } from "react";

type Job = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  step: string | null;
  error: string | null;
  output: unknown;
};

export function JobProgress({
  jobId,
  onDone,
}: {
  jobId: string;
  onDone?: (output: unknown) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);

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
    return () => {
      stopped = true;
    };
  }, [jobId, onDone]);

  if (!job) return <div className="text-muted text-sm">starting…</div>;

  if (job.status === "error") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        {job.error ?? "unknown error"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{job.step ?? job.status}</span>
        <span className="tabular-nums text-muted">{job.progress}%</span>
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
