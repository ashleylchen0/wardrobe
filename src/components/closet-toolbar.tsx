"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Sort lives in a select rather than a row of links: eight labels laid out
 * flat crowded the filter row, and only one of them is ever active.
 *
 * Labels are duplicated here rather than imported from `queries.ts`, which
 * opens a database connection at module load and cannot be pulled into a
 * client bundle. `SORTS` there remains the source of truth for the keys.
 */
const SORT_LABELS: [string, string][] = [
  ["worn", "Most worn"],
  ["recent", "Recently worn"],
  ["cpw", "Cost/wear low → high"],
  ["cost", "Cost"],
  ["brand", "Brand"],
  ["name", "Name"],
];

/** Matches the default in `ClosetPage`, and so is the value we omit from the URL. */
const DEFAULT_SORT = "worn";

export function ClosetToolbar({ sort }: { sort: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const patch = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex items-center gap-3">
      <span className="microcap text-muted text-[10px]">Sort</span>
      <select
        value={sort}
        aria-label="Sort items"
        onChange={(e) =>
          patch("sort", e.target.value === DEFAULT_SORT ? null : e.target.value)
        }
        className="microcap border-hair focus:border-ink cursor-pointer border-b bg-transparent py-1 text-[10px] outline-none"
      >
        {SORT_LABELS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
