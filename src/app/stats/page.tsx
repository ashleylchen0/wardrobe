import Link from "next/link";
import { money } from "@/lib/format";
import {
  getStatsItems,
  getWearTotals,
  getWearsByYear,
  type StatsItem,
} from "@/lib/queries";

export const metadata = { title: "Stats · Wardrobe" };

/**
 * Ported from the ashley-outfits prototype. Everything on this page is derived
 * at read time from `item_stats` — no totals are stored, so nothing here can
 * drift from the wear log the way the spreadsheet's cached formulas did.
 *
 * Scoped to the active closet throughout; see `getStatsItems`.
 */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1 py-4">
      <div className="text-3xl tabular-nums">{value}</div>
      <div className="microcap text-muted mt-1 text-[8px]">{label}</div>
    </div>
  );
}

type Row = { id: string; name: string; value: string; sub?: string };

function RankedList({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <h2 className="microcap border-ink border-b pb-1.5 text-[10px] font-bold">
        {title}
      </h2>
      <ol>
        {rows.map((row, i) => (
          <li
            key={row.id}
            className="border-hair flex items-baseline gap-3 border-b py-1.5"
          >
            <span className="text-muted w-5 shrink-0 text-[15px] tabular-nums">
              {i + 1}
            </span>
            <Link
              href={`/items/${row.id}`}
              className="microcap min-w-0 flex-1 truncate text-[10px] font-bold hover:underline"
            >
              {row.name}
            </Link>
            <span className="shrink-0 text-[11px] tabular-nums">{row.value}</span>
            {row.sub && (
              <span className="text-muted shrink-0 text-[10px] tabular-nums">
                {row.sub}
              </span>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="microcap text-muted py-2 text-[10px]">Nothing yet.</li>
        )}
      </ol>
    </section>
  );
}

/** Cost per wear as a number of cents, for sorting. */
function cpwCents(item: StatsItem): number | null {
  return item.costPerWearCents === null ? null : Number(item.costPerWearCents);
}

export default async function StatsPage() {
  const [all, totals, years] = await Promise.all([
    getStatsItems(),
    getWearTotals(),
    getWearsByYear(),
  ]);

  const invested = all.reduce((sum, i) => sum + (i.costCents ?? 0), 0);
  const avgCpw = totals.totalWears > 0 ? invested / totals.totalWears : 0;

  const worn = all.filter((i) => i.timesWorn > 0);
  const mostWorn = [...worn].sort((a, b) => b.timesWorn - a.timesWorn).slice(0, 10);

  // Gifts and hand-me-downs divide to $0.00 and would fill every value ranking
  // ahead of anything actually paid for. Unrecorded cost is a different thing
  // from a cost of zero, and is excluded by having no cost per wear at all.
  const paidWorn = worn.filter((i) => (i.costCents ?? 0) > 0 && cpwCents(i) !== null);
  const bestValue = [...paidWorn].sort((a, b) => cpwCents(a)! - cpwCents(b)!).slice(0, 10);
  const needsWear = [...paidWorn].sort((a, b) => cpwCents(b)! - cpwCents(a)!).slice(0, 8);
  const neverWorn = all.filter((i) => i.timesWorn === 0 && i.status === "active");

  const spendByCat = new Map<string, { spend: number; count: number }>();
  for (const i of all) {
    const entry = spendByCat.get(i.category) ?? { spend: 0, count: 0 };
    entry.spend += i.costCents ?? 0;
    entry.count += 1;
    spendByCat.set(i.category, entry);
  }
  const cats = [...spendByCat.entries()].sort((a, b) => b[1].spend - a[1].spend);
  const maxCatSpend = Math.max(1, ...cats.map(([, v]) => v.spend));
  const maxYearWears = Math.max(1, ...years.map((y) => y.count));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="divide-hair border-ink grid grid-cols-2 divide-x border-y sm:grid-cols-5">
        <Stat value={String(all.length)} label="Items in closet" />
        <Stat value={totals.totalWears.toLocaleString("en-US")} label="Wears logged" />
        <Stat value={totals.totalDays.toLocaleString("en-US")} label="Days tracked" />
        <Stat value={money(invested) ?? "—"} label="Invested" />
        <Stat value={money(Math.round(avgCpw)) ?? "—"} label="≈ avg cost per wear" />
      </div>

      <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
        <RankedList
          title="Most worn — all time"
          rows={mostWorn.map((i) => ({
            id: i.id,
            name: i.name,
            value: `${i.timesWorn}×`,
            sub: cpwCents(i) !== null ? `${money(cpwCents(i)!)}/wear` : "—",
          }))}
        />
        <RankedList
          title="Best value — cost per wear"
          rows={bestValue.map((i) => ({
            id: i.id,
            name: i.name,
            value: `${money(cpwCents(i)!)}/wear`,
            sub: `${money(i.costCents)} · ${i.timesWorn}×`,
          }))}
        />
        <RankedList
          title="Needs wear — priciest per wear"
          rows={needsWear.map((i) => ({
            id: i.id,
            name: i.name,
            value: `${money(cpwCents(i)!)}/wear`,
            sub: `${money(i.costCents)} · ${i.timesWorn}×`,
          }))}
        />
        <section>
          <h2 className="microcap border-ink border-b pb-1.5 text-[10px] font-bold">
            Never worn · {neverWorn.length}
          </h2>
          <ul>
            {neverWorn.map((i) => (
              <li
                key={i.id}
                className="border-hair flex items-baseline gap-3 border-b py-1.5"
              >
                <Link
                  href={`/items/${i.id}`}
                  className="microcap min-w-0 flex-1 truncate text-[10px] font-bold hover:underline"
                >
                  {i.name}
                </Link>
                <span className="text-muted shrink-0 text-[11px] tabular-nums">
                  {money(i.costCents) ?? "—"}
                </span>
              </li>
            ))}
            {neverWorn.length === 0 && (
              <li className="microcap text-muted py-2 text-[10px]">
                Everything has been worn — closet fully in rotation.
              </li>
            )}
          </ul>
        </section>
      </div>

      <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
        <section>
          <h2 className="microcap border-ink border-b pb-1.5 text-[10px] font-bold">
            Spend by category
          </h2>
          <div className="mt-3 space-y-1.5">
            {cats.map(([cat, v]) => (
              <div
                key={cat}
                className="grid grid-cols-[92px_1fr_88px] items-center gap-3 text-[11px] tabular-nums"
              >
                <Link
                  href={`/?category=${encodeURIComponent(cat)}`}
                  className="microcap text-muted hover:text-ink truncate text-[9px]"
                >
                  {cat} · {v.count}
                </Link>
                <span
                  className="bg-ink h-2"
                  style={{ width: `${(v.spend / maxCatSpend) * 100}%` }}
                />
                <span className="text-right">{money(v.spend)}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="microcap border-ink border-b pb-1.5 text-[10px] font-bold">
            Wears by year
          </h2>
          <div className="mt-3 space-y-1.5">
            {years.map((y) => (
              <div
                key={y.year}
                className="grid grid-cols-[38px_1fr_52px] items-center gap-3 text-[11px] tabular-nums"
              >
                <span className="text-muted">{y.year}</span>
                <span
                  className="bg-ink h-2"
                  style={{ width: `${(y.count / maxYearWears) * 100}%` }}
                />
                <span className="text-right">{y.count.toLocaleString("en-US")}</span>
              </div>
            ))}
          </div>
          <p className="microcap text-muted mt-3 text-[8px] leading-relaxed">
            Everything on this page counts only the closet you own now —
            archived pieces and their wears are excluded. Avg cost per wear ≈
            total invested ÷ total wears; items with unknown cost count as $0.
          </p>
        </section>
      </div>
    </main>
  );
}
