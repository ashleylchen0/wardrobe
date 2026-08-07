import Link from "next/link";
import { FilterChip, StatusTab } from "@/components/filter-chip";
import { ItemCard } from "@/components/item-card";
import {
  CATEGORIES,
  SORTS,
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

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-8">
        <header className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <h1 className="font-serif text-3xl tracking-tight">
            {status === "archived" ? "Archived" : "The closet"}
          </h1>
          <p className="text-muted text-sm tabular-nums">
            {itemList.length} of {total} items
          </p>
          <Link
            href="/items/new"
            className="border-hair hover:border-ink ml-auto border px-4 py-1.5 text-xs transition-colors"
          >
            Add item
          </Link>
        </header>

        {/* Status is a separate axis from category — an archived item still has one. */}
        <nav className="border-hair flex gap-6 border-b" aria-label="Filter by status">
          <StatusTab
            href={href({ status: "active", category: "" })}
            active={status === "active"}
          >
            In closet{" "}
            <span className="tabular-nums opacity-60">
              {statusCounts.get("active") ?? 0}
            </span>
          </StatusTab>
          <StatusTab
            href={href({ status: "archived", category: "" })}
            active={status === "archived"}
          >
            Archived{" "}
            <span className="tabular-nums opacity-60">
              {statusCounts.get("archived") ?? 0}
            </span>
          </StatusTab>
        </nav>

        <nav className="flex flex-wrap gap-2" aria-label="Filter by category">
          <FilterChip href={href({ category: "" })} active={!category}>
            Everything <span className="opacity-60">{total}</span>
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip key={c} href={href({ category: c })} active={category === c}>
              {c} <span className="opacity-60">{counts.get(c) ?? 0}</span>
            </FilterChip>
          ))}
        </nav>

        <div className="border-hair flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4">
          <span className="eyebrow">Sort</span>
          {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
            <Link
              key={s}
              href={href({ sort: s })}
              className={
                sort === s
                  ? "border-ink border-b text-xs"
                  : "text-muted hover:text-ink border-b border-transparent text-xs transition-colors"
              }
            >
              {SORTS[s]}
            </Link>
          ))}
        </div>

        {itemList.length === 0 ? (
          <p className="text-muted border-hair border border-dashed px-6 py-16 text-center text-sm">
            {status === "archived"
              ? "Nothing archived yet. Open an item and choose Archive when you donate or sell it."
              : "Nothing in this category yet."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {itemList.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
