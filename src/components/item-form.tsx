"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { createItem } from "@/app/items/new-item-actions";

/**
 * The full add-item form. Only name and category are required — 60 of the
 * imported items have no cost and 29 no date, so demanding either would be the
 * wrong shape for how this wardrobe actually gets recorded.
 */
export function ItemForm({ brands }: { brands: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<Category>("tops");
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setSuggestion(null);
    formData.set("category", category);

    startTransition(async () => {
      const result = await createItem(formData);
      if (result.ok) {
        router.push(`/items/${result.id}`);
        return;
      }
      setError(result.error);
      setSuggestion(result.suggestion ?? null);
    });
  }

  function useSuggestion() {
    const input = formRef.current?.elements.namedItem("name");
    if (input instanceof HTMLInputElement && suggestion) {
      input.value = suggestion;
      setSuggestion(null);
      setError(null);
      input.focus();
    }
  }

  return (
    <form ref={formRef} action={submit} className="flex max-w-xl flex-col gap-6">
      <Field label="Item name" hint="How you'd refer to it when logging an outfit">
        <input
          name="name"
          required
          autoFocus
          maxLength={120}
          className="border-hair focus:border-sage w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Brand" hint="Pick an existing one to keep the filter tidy">
          <input
            name="brand"
            list="brand-options"
            maxLength={80}
            className="border-hair focus:border-sage w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none"
          />
          <datalist id="brand-options">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>

        <Field label="Cost" hint="Leave blank if you don't know — that's not the same as free">
          <div className="border-hair focus-within:border-sage flex items-center gap-1 rounded-lg border bg-card px-3 py-2">
            <span className="text-muted text-sm">$</span>
            <input
              name="cost"
              inputMode="decimal"
              placeholder=""
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </Field>
      </div>

      <Field label="Category">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
                category === c
                  ? "bg-ink text-paper"
                  : "border-hair text-muted hover:border-ink border"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Acquired" hint="Opens a calendar — leave blank if unknown">
          <input
            type="date"
            name="acquiredOn"
            max={new Date().toISOString().slice(0, 10)}
            className="border-hair focus:border-sage w-full rounded-lg border bg-card px-3 py-2 text-sm tabular-nums outline-none"
          />
        </Field>

        <Field label="Tags" hint="Comma separated, e.g. workout">
          <input
            name="tags"
            className="border-hair focus:border-sage w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none"
          />
        </Field>
      </div>

      <Field label="Product link" hint="Optional — the photo you upload is what survives if the page goes down">
        <input
          type="url"
          name="productUrl"
          placeholder="https://"
          className="border-hair focus:border-sage w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none"
        />
      </Field>

      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          className="border-hair focus:border-sage w-full resize-y rounded-lg border bg-card px-3 py-2 text-sm outline-none"
        />
      </Field>

      {error && (
        <div className="border-cpw-bad/40 bg-cpw-bad/5 text-cpw-bad flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm">
          <span>{error}</span>
          {suggestion && (
            <button
              type="button"
              onClick={useSuggestion}
              className="text-ink underline underline-offset-4"
            >
              Use “{suggestion}” instead
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-sage hover:bg-sage/90 rounded-full px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to closet"}
        </button>
        <p className="text-muted text-xs">
          You can add a photo on the next screen.
        </p>
      </div>
    </form>
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
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-muted text-xs">{hint}</span>}
    </label>
  );
}
