import Link from "next/link";
import { money, moneyFromNumeric } from "@/lib/format";
import {
  CATEGORIES,
  SORTS,
  getCategoryCounts,
  getClosetItems,
  isCategory,
  isSort,
  type ClosetItem,
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
    <main className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Closet</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {itemList.length} of {total} items
        </p>
      </header>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by category">
        <FilterChip href={href({ category: "" })} active={!category}>
          All <span className="opacity-60">{total}</span>
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} href={href({ category: c })} active={category === c}>
            {c} <span className="opacity-60">{counts.get(c) ?? 0}</span>
          </FilterChip>
        ))}
      </nav>

      <div className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500 dark:text-stone-400">Sort by</span>
        {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
          <Link
            key={s}
            href={href({ sort: s })}
            className={
              sort === s
                ? "font-medium text-stone-900 underline underline-offset-4 dark:text-stone-50"
                : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            }
          >
            {SORTS[s]}
          </Link>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {itemList.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </ul>

      {itemList.length === 0 && (
        <p className="py-16 text-center text-stone-500">Nothing in this category yet.</p>
      )}
    </main>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-sm capitalize transition-colors ${
        active
          ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
          : "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      }`}
    >
      {children}
    </Link>
  );
}

function ItemCard({ item }: { item: ClosetItem }) {
  const cpw = moneyFromNumeric(item.costPerWearCents);
  const cost = money(item.costCents);

  return (
    <li>
      <Link href={`/items/${item.id}`} className="group block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
          {item.imagePath ? (
            // eslint-disable-next-line @next/next/no-img-element -- private blob, proxied
            <img
              src={`/api/photo/${item.imagePath}`}
              alt={item.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs text-stone-400 dark:text-stone-500">
              No photo yet
            </div>
          )}
          {item.needsReview && (
            <span
              className="absolute right-2 top-2 rounded-full bg-amber-400/95 px-2 py-0.5 text-[11px] font-medium text-amber-950"
              title="Imported with conflicting or missing data"
            >
              review
            </span>
          )}
        </div>

        <div className="mt-2 space-y-0.5">
          <p className="truncate text-sm font-medium leading-snug" title={item.name}>
            {item.name}
          </p>
          <p className="truncate text-xs text-stone-500 dark:text-stone-400">
            {item.brand ?? "—"}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {item.timesWorn} {item.timesWorn === 1 ? "wear" : "wears"}
            {cpw && <> · {cpw}/wear</>}
            {!cpw && cost === "$0.00" && <> · free</>}
          </p>
        </div>
      </Link>
    </li>
  );
}
