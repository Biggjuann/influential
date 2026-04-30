"use client";
import type { Product } from "@/lib/db/schema";

/**
 * Compact product picker. Shows a grid of product thumbnails (with the
 * "Auto-generate" / "None" option as the first card). Used by Studio + Reels
 * to attach a product to a render.
 */
export function ProductPicker({
  products,
  value,
  onChange,
  label = "Product",
  hint,
}: {
  products: Product[];
  value: string | null;
  onChange: (productId: string | null) => void;
  label?: string;
  hint?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
        No products on this influencer yet. Add one from the influencer page to use it in product
        formats.
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`shrink-0 w-20 h-20 rounded-md border-2 grid place-items-center text-xs text-center px-1 transition-colors ${
            value === null
              ? "border-accent bg-accent/10"
              : "border-border hover:border-muted"
          }`}
        >
          None
        </button>
        {products.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => onChange(p.id)}
            title={p.name}
            className={`shrink-0 w-20 rounded-md overflow-hidden border-2 transition-colors ${
              value === p.id ? "border-accent" : "border-transparent hover:border-muted"
            }`}
          >
            {p.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0]} alt="" className="w-20 h-20 object-cover bg-bg" />
            ) : (
              <div className="w-20 h-20 bg-bg grid place-items-center text-[10px] text-muted">
                no img
              </div>
            )}
            <div className="text-[10px] px-1 py-0.5 truncate text-left">{p.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Formats that meaningfully use a product reference. */
export const PRODUCT_FORMATS = new Set(["unboxing", "product_review", "try_on", "tutorial"]);
