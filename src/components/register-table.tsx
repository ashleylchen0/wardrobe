import Link from "next/link";
import { ItemPhoto } from "@/components/item-photo";
import { fmtDate, money, moneyFromNumeric } from "@/lib/format";
import type { ClosetItem } from "@/lib/queries";
import type { Sort } from "@/lib/sorts";

/**
 * The closet as a register: one row per garment, numbers in columns you can
 * compare down. The grid is for recognising things by sight; this is for
 * reading the ledger.
 *
 * Columns whose header sorts carry both directions — clicking the active one
 * flips it, which is why the ascending sort keys exist.
 */
const HEADERS: {
  label: string;
  desc?: Sort;
  asc?: Sort;
  align: string;
}[] = [
  { label: "Cost", desc: "cost", align: "text-right" },
  { label: "Worn", desc: "worn", asc: "worn-asc", align: "text-right" },
  { label: "$/wear", desc: "cpw-desc", asc: "cpw", align: "text-right" },
  { label: "Last worn", desc: "recent", align: "text-right" },
];

export function RegisterTable({
  items,
  sort,
  href,
}: {
  items: ClosetItem[];
  sort: Sort;
  href: (next: { sort?: Sort }) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12px]">
        <thead>
          <tr className="microcap border-ink text-muted border-b text-left text-[9px]">
            <th className="py-2 pr-2 font-normal" colSpan={2}>
              Item · {items.length}
            </th>
            <th className="py-2 pr-4 font-normal">Category</th>
            {HEADERS.map((h) => {
              const active = sort === h.desc || sort === h.asc;
              // Clicking the column you are already sorted by reverses it.
              const next = sort === h.desc && h.asc ? h.asc : h.desc!;
              return (
                <th
                  key={h.label}
                  className={`py-2 pr-2 font-normal last:pr-0 ${h.align}`}
                  aria-sort={
                    active
                      ? sort === h.asc
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <Link
                    href={href({ sort: next })}
                    className={active ? "text-ink font-bold" : "hover:text-ink"}
                  >
                    {h.label}
                    {active ? (sort === h.asc ? " ↑" : " ↓") : ""}
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-hair border-b align-middle">
              <td className="w-10 py-1.5 pr-2">
                <Link href={`/items/${item.id}`} className="block">
                  <ItemPhoto
                    name={item.name}
                    imagePath={item.imagePath}
                    category={item.category}
                    className="h-10 w-8"
                    emojiClassName="text-base"
                  />
                </Link>
              </td>
              <td className="py-1.5 pr-2">
                <Link
                  href={`/items/${item.id}`}
                  className="microcap font-bold hover:underline"
                >
                  {item.name}
                </Link>
                <span className="microcap text-muted block text-[9px]">
                  {item.brand ?? "—"}
                </span>
              </td>
              <td className="microcap text-muted py-1.5 pr-4 text-[10px]">
                {item.category}
              </td>
              <td className="text-muted py-1.5 pr-2 text-right tabular-nums">
                {money(item.costCents) ?? "—"}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {item.timesWorn}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {moneyFromNumeric(item.costPerWearCents) ?? "—"}
              </td>
              <td className="text-muted py-1.5 text-right tabular-nums">
                {fmtDate(item.lastWorn)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
