"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { DEFAULT_SORT, SORTS } from "@/lib/sorts";

/**
 * Search, sort and the grid/list switch. Each writes to the URL rather than to
 * local state, so a filtered closet is a link you can keep — and the server
 * does the filtering, which matters at 230 items with photos.
 */
export function ClosetToolbar({
  sort,
  q,
  view,
}: {
  sort: string;
  q: string;
  view: "grid" | "list";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt a q changed from outside — the back button, or a cleared filter.
  if (prevQ !== q) {
    setPrevQ(q);
    setQuery(q);
  }

  const patch = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <input
        type="search"
        value={query}
        placeholder="Search"
        aria-label="Search items"
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          // Typing shouldn't fire a query per keystroke, but it also shouldn't
          // feel laggy: a quarter second is under the threshold where you
          // notice waiting.
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => patch("q", v.trim() || null), 250);
        }}
        className="border-hair focus:border-ink w-28 border-b bg-transparent py-1 text-[12px] outline-none sm:w-40"
      />

      <select
        value={sort}
        aria-label="Sort items"
        onChange={(e) =>
          patch("sort", e.target.value === DEFAULT_SORT ? null : e.target.value)
        }
        className="microcap border-hair focus:border-ink cursor-pointer border-b bg-transparent py-1 text-[10px] outline-none"
      >
        {Object.entries(SORTS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => patch("view", view === "list" ? null : "list")}
        aria-pressed={view === "list"}
        className="microcap text-muted hover:text-ink cursor-pointer pb-0.5 text-[10px]"
      >
        {view === "list" ? "Grid" : "List"}
      </button>
    </div>
  );
}
