import Link from "next/link";
import { ClosetToolbar } from "@/components/closet-toolbar";
import { FilterChip } from "@/components/filter-chip";
import { ItemCard } from "@/components/item-card";
import {
  CATEGORIES,
  getCategoryCounts,
  getClosetItems,
  getStatusCounts,
  isCategory,
  isSort,
  isStatus,
} from "@/lib/queries";

export const metadata = { title: "Closet · Wardrobe" };

export default async function ClosetPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; status?: string }>;
}) {
  const params = await searchParams;
  const category = isCategory(params.category) ? params.category : undefined;
  const sort = isSort(params.sort) ? params.sort : "worn";
  const status = isStatus(params.status) ? params.status : "active";

  const [itemList, counts, statusCounts] = await Promise.all([
    getClosetItems({ category, sort, status }),
    getCategoryCounts(status),
    getStatusCounts(),
  ]);

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const href = (next: { category?: string; sort?: string; status?: string }) => {
    const sp = new URLSearchParams();
    const c = next.category ?? category;
    const s = next.sort ?? sort;
    const st = next.status ?? status;
    if (c) sp.set("category", c);
    if (s !== "worn") sp.set("sort", s);
    if (st !== "active") sp.set("status", st);
    const qs = sp.toString();
    return qs ? `/?${qs}` : "/";
  };

  const archivedCount = statusCounts.get("archived") ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      {/* One rule under one row of controls: filters on the left, sort on the
          right, everything at label size. */}
      <div className="border-hair flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b pb-3">
        <nav
          className="flex items-baseline gap-4 overflow-x-auto"
          aria-label="Filter items"
        >
          <FilterChip href={href({ category: "", status: "active" })} active={status === "active" && !category}>
            All {statusCounts.get("active") ?? 0}
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c}
              href={href({ category: c, status: "active" })}
              active={status === "active" && category === c}
            >
              {c} {counts.get(c) ?? 0}
            </FilterChip>
          ))}
          {archivedCount > 0 && (
            <FilterChip
              href={href({ category: "", status: "archived" })}
              active={status === "archived"}
            >
              Archived {archivedCount}
            </FilterChip>
          )}
        </nav>

        <div className="flex items-baseline gap-5">
          <ClosetToolbar sort={sort} />
          <Link href="/items/new" className="microcap text-[10px] hover:underline">
            + Add
          </Link>
        </div>
      </div>

      {itemList.length === 0 ? (
        <p className="microcap text-muted py-16 text-center text-[11px]">
          {status === "archived"
            ? "Nothing archived yet — open an item and choose Archive when you donate or sell it."
            : "Nothing in this category yet."}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
            {itemList.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
          <p className="microcap text-muted text-[9px]">
            {itemList.length} of {total} shown
          </p>
        </>
      )}
    </main>
  );
}
