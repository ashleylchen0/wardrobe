"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { createItem } from "@/app/items/item-actions";
import { ItemPhoto } from "@/components/item-photo";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { PickableItem } from "@/lib/queries";
import { setWear } from "./actions";

/**
 * Two columns on a wide screen: today's outfit on the left, the catalogue on
 * the right, so picking never pushes what you've already chosen off screen. On
 * a phone they stack, outfit first.
 *
 * Both sides are the closet's register row — 32×40 photo well, name in caps,
 * brand beneath — because what you're wearing and what you can pick are the
 * same kind of thing. Wear counts and cost-per-wear are deliberately absent:
 * this screen is for recognising a garment, not appraising it.
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

  /**
   * The keyboard cursor: an index into `shown`, or -1 for no row highlighted.
   * It is clamped rather than tracked by item identity, since the list is
   * rebuilt on every keystroke.
   */
  const [active, setActive] = useState(-1);

  const toggle = useCallback(
    (item: PickableItem, on: boolean) => {
      startTransition(async () => {
        // Logging something ends that search — an outfit is five or six
        // unrelated pieces, so the next one is a fresh query, never a
        // refinement of this one. Cleared inside the transition so the list
        // never flashes the whole closet with the picked item still in it.
        if (on) {
          setQuery("");
          setActive(-1);
        }
        setWorn({ id: item.id, on });
        await setWear(item.id, date, on);
      });
    },
    [date, setWorn],
  );

  const activeIndex =
    shown.length === 0 ? -1 : Math.min(active, shown.length - 1);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // The date field, the quick-add form and anything else editable own
      // their own arrow keys; only the search box hands them to the list.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target !== searchRef.current &&
        (target.isContentEditable ||
          /^(input|textarea|select)$/i.test(target.tagName))
      ) {
        return;
      }

      if (e.key === "Escape") {
        setActive(-1);
        return;
      }
      // With nothing to move through, the arrows still belong to the page.
      if (shown.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, shown.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, -1));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        toggle(shown[activeIndex], true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, shown, toggle]);

  return (
    <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div>
        <div className="microcap text-muted pb-1 text-[9px]">
          Wearing · {selected.length}
        </div>
        {selected.length === 0 ? (
          <p className="microcap text-muted border-hair border border-dashed px-3 py-4 text-center text-[10px]">
            Nothing logged for this day yet — pick anything from the list.
          </p>
        ) : (
          <ul className="divide-hair border-hair divide-y border">
            {selected.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item, false)}
                  title="Remove from this day"
                  className="hover:bg-tile flex w-full cursor-pointer items-center gap-2 py-1.5 pr-2 pl-2 text-left"
                >
                  <ItemPhoto
                    name={item.name}
                    imagePath={item.imagePath}
                    category={item.category}
                    className="h-10 w-8 shrink-0"
                    emojiClassName="text-base"
                  />
                  <ItemLabel name={item.name} brand={item.brand} />
                  <span className="text-muted shrink-0 pl-2 text-[11px]">✕</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <input
          ref={searchRef}
          type="search"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls="pick-list"
          aria-activedescendant={
            activeIndex >= 0 ? optionId(shown[activeIndex].id) : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // After typing, the top match is the one Enter should log.
            setActive(e.target.value.trim() ? 0 : -1);
          }}
          placeholder={`Search ${items.length} items`}
          aria-label="Search items"
          className="border-ink w-full border bg-transparent px-2 py-2 text-[13px] outline-none"
        />

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <CategoryChip
            active={!category}
            onClick={() => {
              setCategory(null);
              setActive(-1);
            }}
          >
            Everything
          </CategoryChip>
          {CATEGORIES.map((c) => (
            <CategoryChip
              key={c}
              active={category === c}
              onClick={() => {
                setCategory(category === c ? null : c);
                setActive(-1);
              }}
            >
              {c}
            </CategoryChip>
          ))}
        </div>

        {visible.length === 0 ? (
          <QuickAdd query={query.trim()} onAdded={() => setQuery("")} />
        ) : (
          <>
            <div className="border-hair mt-2 border">
              <ul
                ref={listRef}
                id="pick-list"
                role="listbox"
                aria-label="Items you can log"
                className="divide-hair max-h-[26rem] divide-y overflow-y-auto"
              >
                {shown.map((item, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <li
                      key={item.id}
                      id={optionId(item.id)}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => toggle(item, true)}
                      className={`flex cursor-pointer items-center gap-2 py-1.5 pr-2 ${
                        isActive
                          ? "bg-tile border-ink border-l-2 pl-1.5"
                          : "hover:bg-tile pl-2"
                      }`}
                    >
                      <ItemPhoto
                        name={item.name}
                        imagePath={item.imagePath}
                        category={item.category}
                        className="h-10 w-8 shrink-0"
                        emojiClassName="text-base"
                      />
                      <ItemLabel name={item.name} brand={item.brand} />
                    </li>
                  );
                })}
              </ul>
              {visible.length > shown.length && (
                <p className="microcap text-muted border-hair border-t px-2 py-1.5 text-[9px]">
                  + {visible.length - shown.length} more — keep typing
                </p>
              )}
            </div>
            <p className="microcap text-muted mt-1.5 text-[9px]">
              ↑ ↓ to move · ⏎ to log · esc to clear
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Stable DOM id for `aria-activedescendant` to point at. */
function optionId(itemId: string): string {
  return `pick-${itemId}`;
}

/** The register row's text block: name in caps, brand beneath it. */
function ItemLabel({ name, brand }: { name: string; brand: string | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="microcap block truncate text-[12px] font-bold">
        {name}
      </span>
      <span className="microcap text-muted block truncate text-[9px]">
        {brand ?? "—"}
      </span>
    </span>
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
