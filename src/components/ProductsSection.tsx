"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import type { Product } from "@/lib/db/schema";

export function ProductsSection({
  influencerId,
  initialProducts,
}: {
  influencerId: string;
  initialProducts: Product[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [adding, setAdding] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/influencers/${influencerId}/products`);
    if (!res.ok) return;
    const data = (await res.json()) as { products: Product[] };
    setProducts(data.products);
    router.refresh();
  }

  async function remove(productId: string) {
    if (!confirm("Delete this product? Its images will be removed too.")) return;
    const res = await fetch(`/api/influencers/${influencerId}/products/${productId}`, {
      method: "DELETE",
    });
    if (res.ok) refresh();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Products</h2>
          <div className="text-xs text-muted mt-0.5">
            Used by Tutorial / Unboxing / Product Review / Try-On formats — pipeline injects the
            product name and uses your uploaded images for detail / cutaway shots.
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          + Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted text-sm">
          No products yet. Add one to use across product-format reels and videos.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-border bg-panel overflow-hidden"
            >
              {p.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0]} alt="" className="aspect-square w-full object-cover bg-bg" />
              ) : (
                <div className="aspect-square w-full grid place-items-center text-muted text-xs">
                  no image
                </div>
              )}
              <div className="p-3 space-y-1">
                <div className="text-sm font-medium truncate">{p.name}</div>
                {p.description && (
                  <div className="text-xs text-muted line-clamp-2">{p.description}</div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted">
                    {p.images?.length ?? 0} {p.images?.length === 1 ? "image" : "images"}
                  </span>
                  <button
                    onClick={() => remove(p.id)}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddProductModal
          influencerId={influencerId}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function AddProductModal({
  influencerId,
  onClose,
  onCreated,
}: {
  influencerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (description.trim()) fd.append("description", description.trim());
      if (externalUrl.trim()) fd.append("externalUrl", externalUrl.trim());
      for (const f of files) fd.append("images", f);
      const res = await fetch(`/api/influencers/${influencerId}/products`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border bg-panel p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add product</h3>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-text">
            Close
          </button>
        </div>

        <Field label="Name" hint="What this product is called.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Wilson Pro Staff Tennis Racket"
            className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
          />
        </Field>

        <Field
          label="Description (optional)"
          hint="One line of detail — used in scripts and prompts."
        >
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="lime-green strung 16x19, 320g, control-frame for advanced players"
            className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
          />
        </Field>

        <Field label="External link (optional)" hint="Where viewers can buy it.">
          <input
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://yourshop.com/products/..."
            className="w-full h-10 rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
          />
        </Field>

        <Field
          label="Product images"
          hint="JPG / PNG / WebP, up to 8 images, ≤ 10MB each. The first image is the canonical reference."
        >
          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              Choose images
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (list) setFiles(Array.from(list).slice(0, 8));
              }}
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full border border-border bg-bg/60 truncate max-w-[180px]"
                    title={f.name}
                  >
                    {f.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Field>

        {err && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save product"}
          </Button>
        </div>
      </form>
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
        {hint && <span className="text-xs text-muted ml-3 text-right">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
