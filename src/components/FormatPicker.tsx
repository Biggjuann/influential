"use client";
import { FORMAT_PRESETS, FORMAT_LIST, type Format } from "@/lib/formatPresets";

export function FormatPicker({
  value,
  onChange,
  label = "Format",
  hint,
}: {
  value: Format;
  onChange: (v: Format) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {FORMAT_LIST.map((f) => {
          const preset = FORMAT_PRESETS[f];
          const selected = value === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onChange(f)}
              title={preset.description}
              className={`text-left rounded-lg border p-3 transition-colors ${
                selected
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-muted hover:bg-border/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{preset.emoji}</span>
                <span className="text-sm font-medium">{preset.label}</span>
              </div>
              <div className="text-xs text-muted mt-1 leading-snug line-clamp-2">
                {preset.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
