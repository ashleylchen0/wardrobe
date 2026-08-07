"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { createItem } from "@/app/items/item-actions";
import { moneyFromNumeric } from "@/lib/format";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { PickableItem } from "@/lib/queries";
import { setWear } from "./actions";

/**
 * Laid out as a search-and-list the way the prototype's log page is: a day's
 * outfit is five or six pieces, so a scannable list of names beats a grid of
 * tiles you have to read pictorially.
 *
 * The interaction is still this app's own — tapping writes the wear
 * immediately, optimistically, with no Save step to forget.
 */
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

  // Optimistic so tapping a row feels instant; the server action reconciles.
  const [worn, setWorn] = useOptimistic(
    wornItemIds,
    (state: string[], change: { id: string; on: boolean }) =>
      change.on ? [...state, change.id] : state.filter((id) => id !== change.id),
  );

  const wornSet = useMemo(() => new Set(worn), [worn]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (wornSet.has(item.id)) return false;
      if (category && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.brand?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, category, wornSet]);

  const selected = useMemo(
    () => items.filter((i) => wornSet.has(i.id)),
    [items, wornSet],
  );

  const shown = visible.slice(0, 24);

  function toggle(item: PickableItem) {
    const on = !wornSet.has(item.id);
    startTransition(async () => {
      setWorn({ id: item.id, on });
      await setWear(item.id, date, on);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="microcap text-muted pb-1 text-[9px]">
          Wearing · {selected.length}
        </div>
        {selected.length === 0 ? (
          <p className="microcap text-muted border-hair border border-dashed px-3 py-4 text-center text-[10px]">
            Nothing logged for this day yet — tap anything below to add it.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className="microcap border-ink hover:bg-tile cursor-pointer border px-2 py-1 text-[9px]"
                  title="Remove from this day"
                >
                  {item.name} <span className="text-muted">✕</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${items.length} items`}
          aria-label="Search items"
          className="border-ink w-full border bg-transparent px-2 py-2 text-[13px] outline-none"
        />

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
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

        {visible.length === 0 ? (
          <QuickAdd query={query.trim()} onAdded={() => setQuery("")} />
        ) : (
          <ul className="divide-hair border-hair mt-2 max-h-72 divide-y overflow-y-auto border">
            {shown.map((item) => {
              const cpw = moneyFromNumeric(item.costPerWearCents);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    className="hover:bg-tile flex w-full cursor-pointer items-baseline justify-between gap-3 px-2 py-1.5 text-left"
                  >
                    <span className="microcap min-w-0 truncate text-[10px] font-bold">
                      {item.name}
                      <span className="text-muted ml-2 font-normal">
                        {item.brand ?? ""}
                      </span>
                    </span>
                    <span className="text-muted shrink-0 text-[10px] tabular-nums">
                      {item.timesWorn}×{cpw && ` · ${cpw}`}
                    </span>
                  </button>
                </li>
              );
            })}
            {visible.length > shown.length && (
              <li className="microcap text-muted px-2 py-1.5 text-[9px]">
                + {visible.length - shown.length} more — keep typing
              </li>
            )}
          </ul>
        )}
      </div>
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
      <p className="microcap text-muted py-8 text-center text-[10px]">
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
    <div className="border-hair mt-2 flex flex-col gap-3 border border-dashed px-3 py-4">
      <p className="microcap text-[10px]">
        Nothing matches “{query}”. Add it to the closet?
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
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

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="microcap bg-ink text-paper cursor-pointer px-3 py-1.5 text-[10px] font-bold disabled:opacity-30"
        >
          {pending ? "Adding…" : "Add to closet"}
        </button>
        <Link
          href="/items/new"
          className="microcap text-muted hover:text-ink text-[9px] underline underline-offset-4"
        >
          Add with full details instead
        </Link>
      </div>

      {error && <p className="text-cpw-bad text-[11px]">{error}</p>}
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
      className={`microcap cursor-pointer pb-0.5 text-[10px] capitalize ${
        active
          ? "border-ink border-b font-bold"
          : "text-muted hover:text-ink transition-colors"
      }`}
    >
      {children}
    </button>
  );
}
