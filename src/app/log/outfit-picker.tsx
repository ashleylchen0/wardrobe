"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { ItemPhoto } from "@/components/item-photo";
import { createItem } from "@/app/items/new-item-actions";
import { moneyFromNumeric } from "@/lib/format";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { PickableItem } from "@/lib/queries";
import { setWear } from "./actions";

export function OutfitPicker({
  date,
  items,
  wornItemIds,
}: {
  date: string;
  items: PickableItem[];
  wornItemIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic so tapping a tile feels instant; the server action reconciles.
  const [worn, setWorn] = useOptimistic(
    wornItemIds,
    (state: string[], change: { id: string; on: boolean }) =>
      change.on
        ? [...state, change.id]
        : state.filter((id) => id !== change.id),
  );

  const wornSet = useMemo(() => new Set(worn), [worn]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.brand?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, category]);

  const selected = useMemo(
    () => items.filter((i) => wornSet.has(i.id)),
    [items, wornSet],
  );

  function toggle(item: PickableItem) {
    const on = !wornSet.has(item.id);
    startTransition(async () => {
      setWorn({ id: item.id, on });
      await setWear(item.id, date, on);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="eyebrow">Wearing</h2>
          <span className="text-muted text-xs tabular-nums">
            {selected.length} {selected.length === 1 ? "item" : "items"}
          </span>
        </div>

        {selected.length === 0 ? (
          <p className="text-muted border-hair rounded-2xl border border-dashed px-5 py-8 text-center text-sm">
            Nothing logged for this day yet. Tap anything below to add it.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {selected.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className="border-sage/40 bg-sage-soft hover:border-cpw-bad group flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 text-sm transition-colors"
                  title="Remove from this day"
                >
                  <ItemPhoto
                    name={item.name}
                    imagePath={item.imagePath}
                    category={item.category}
                    className="size-7 shrink-0 rounded-full"
                    garmentClassName="h-[70%] w-[70%]"
                  />
                  <span className="max-w-52 truncate">{item.name}</span>
                  <span className="text-muted group-hover:text-cpw-bad">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="border-hair flex flex-col gap-3 border-t pt-5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or brand…"
            aria-label="Search items"
            className="border-hair focus:border-sage w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none"
          />

          <div className="flex flex-wrap gap-1.5">
            <CategoryChip active={!category} onClick={() => setCategory(null)}>
              Everything
            </CategoryChip>
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                active={category === c}
                onClick={() => setCategory(category === c ? null : c)}
              >
                {c}
              </CategoryChip>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <QuickAdd query={query.trim()} onAdded={() => setQuery("")} />
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {visible.map((item) => {
              const on = wornSet.has(item.id);
              const cpw = moneyFromNumeric(item.costPerWearCents);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    aria-pressed={on}
                    className={`group flex w-full flex-col rounded-xl border p-2 text-left transition-colors ${
                      on
                        ? "border-sage bg-sage-soft"
                        : "border-hair hover:border-sage/40 bg-card"
                    }`}
                  >
                    <ItemPhoto
                      name={item.name}
                      imagePath={item.imagePath}
                      category={item.category}
                      className="aspect-square rounded-lg"
                      garmentClassName="h-[70%] w-[62%]"
                    />
                    <p
                      className="mt-2 truncate text-xs leading-snug"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <p className="text-muted truncate text-[11px] tabular-nums">
                      {item.timesWorn} {item.timesWorn === 1 ? "wear" : "wears"}
                      {cpw && ` · ${cpw}`}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Adding something mid-log, without leaving the page. It lands in the closet
 * unworn — you still tap it to log it, since buying and wearing aren't the same
 * event.
 */
function QuickAdd({ query, onAdded }: { query: string; onAdded: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState<Category>("tops");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!query) {
    return (
      <p className="text-muted py-10 text-center text-sm">
        No items match that filter.
      </p>
    );
  }

  function add() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", query);
      formData.set("category", category);
      const result = await createItem(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onAdded();
    });
  }

  return (
    <div className="border-hair flex flex-col gap-3 rounded-2xl border border-dashed px-5 py-6">
      <p className="text-muted text-sm">
        Nothing in your closet matches “{query}”. Add it?
      </p>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </CategoryChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="bg-sage hover:bg-sage/90 rounded-full px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to closet"}
        </button>
        <Link
          href="/items/new"
          className="text-muted hover:text-ink text-xs underline underline-offset-4"
        >
          Add with full details instead
        </Link>
      </div>

      {error && <p className="text-cpw-bad text-xs">{error}</p>}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs capitalize transition-colors ${
        active
          ? "bg-ink text-paper"
          : "border-hair text-muted hover:border-ink border"
      }`}
    >
      {children}
    </button>
  );
}
