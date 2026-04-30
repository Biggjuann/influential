"use client";
import {
  ASPECT_OPTIONS,
  QUALITY_OPTIONS,
  type AspectRatio,
  type Quality,
} from "@/lib/renderTarget";

/**
 * Higgsfield-style horizontal pill row for render-target controls:
 * aspect ratio · quality · length. Each pill is a popover-style dropdown.
 */
export function RenderTargetBar({
  aspectRatio,
  quality,
  length,
  onAspectChange,
  onQualityChange,
  onLengthChange,
  lengthOptions = [5, 8, 10, 12, 15],
}: {
  aspectRatio: AspectRatio;
  quality: Quality;
  length: number;
  onAspectChange: (v: AspectRatio) => void;
  onQualityChange: (v: Quality) => void;
  onLengthChange: (v: number) => void;
  lengthOptions?: number[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill icon="▭" label={ASPECT_OPTIONS.find((o) => o.id === aspectRatio)?.label ?? aspectRatio}>
        <PopoverList>
          {ASPECT_OPTIONS.map((o) => (
            <PopoverItem
              key={o.id}
              selected={aspectRatio === o.id}
              onClick={() => onAspectChange(o.id)}
            >
              <span className="font-medium">{o.label}</span>
              <span className="text-xs text-muted ml-2">{o.hint}</span>
            </PopoverItem>
          ))}
        </PopoverList>
      </Pill>

      <Pill icon="◆" label={quality}>
        <PopoverList>
          {QUALITY_OPTIONS.map((o) => (
            <PopoverItem key={o.id} selected={quality === o.id} onClick={() => onQualityChange(o.id)}>
              <span className="font-medium">{o.label}</span>
            </PopoverItem>
          ))}
        </PopoverList>
      </Pill>

      <Pill icon="⏱" label={`${length}s`}>
        <PopoverList>
          {lengthOptions.map((s) => (
            <PopoverItem key={s} selected={length === s} onClick={() => onLengthChange(s)}>
              <span className="font-medium">{s}s</span>
              {s > 10 && (
                <span className="text-xs text-muted ml-2">(stitched / extended)</span>
              )}
            </PopoverItem>
          ))}
        </PopoverList>
      </Pill>
    </div>
  );
}

function Pill({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group relative">
      <summary className="list-none cursor-pointer select-none h-9 px-3 inline-flex items-center gap-2 rounded-full border border-border bg-bg/40 hover:bg-border/40 text-sm">
        <span className="text-muted">{icon}</span>
        <span>{label}</span>
        <span className="text-muted text-xs">▾</span>
      </summary>
      <div className="absolute z-30 left-0 top-full mt-1 min-w-[200px] rounded-lg border border-border bg-panel shadow-lg p-1">
        {children}
      </div>
    </details>
  );
}

function PopoverList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function PopoverItem({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-3 py-2 rounded-md text-sm transition-colors ${
        selected ? "bg-accent/15 text-text" : "hover:bg-border/40 text-text"
      }`}
    >
      {children}
    </button>
  );
}
