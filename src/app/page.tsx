import Link from "next/link";
import { FilterChip } from "@/components/filter-chip";
import { ItemCard } from "@/components/item-card";
import {
  CATEGORIES,
  SORTS,
  getCategoryCounts,
  getClosetItems,
  isCategory,
  isSort,
} from "@/lib/queries";

export const metadata = { title: "Closet · Wardrobe" };

export default async function ClosetPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const category = isCategory(params.category) ? params.category : undefined;
  const sort = isSort(params.sort) ? params.sort : "worn";

  const [itemList, counts] = await Promise.all([
    getClosetItems({ category, sort }),
    getCategoryCounts(),
  ]);

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const href = (next: { category?: string; sort?: string }) => {
    const sp = new URLSearchParams();
    const c = next.category ?? category;
    const s = next.sort ?? sort;
    if (c) sp.set("category", c);
    if (s !== "worn") sp.set("sort", s);
    const qs = sp.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-8">
        <header className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <h1 className="font-serif text-3xl tracking-tight">The closet</h1>
          <p className="text-muted text-sm tabular-nums">
            {itemList.length} of {total} items
          </p>
        </header>

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
          <p className="text-muted border-hair rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
            Nothing in this category yet.
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
