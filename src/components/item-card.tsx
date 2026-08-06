import Link from "next/link";

import { CostPerWearBar } from "@/components/cost-per-wear";
import { ItemPhoto } from "@/components/item-photo";
import { money } from "@/lib/format";
import type { ClosetItem } from "@/lib/queries";

export function ItemCard({ item }: { item: ClosetItem }) {
  const cost = money(item.costCents);
  const archived = item.status === "archived";

  return (
    <li className="flex">
      <Link
        href={`/items/${item.id}`}
        className="border-hair hover:border-sage/40 group flex w-full flex-col rounded-2xl border bg-card p-3 transition-[border-color,box-shadow] hover:shadow-[0_10px_30px_-18px_rgba(23,24,26,0.35)]"
      >
        <div className="relative">
          {/* Uniform tile — the grid keeps one rhythm whatever the garment is. */}
          <ItemPhoto
            name={item.name}
            imagePath={item.imagePath}
            category={item.category}
            className={`aspect-[4/5] rounded-xl ${
              archived ? "opacity-55 grayscale" : ""
            }`}
          />
          {item.needsReview && (
            <span
              className="eyebrow text-cpw-bad absolute top-2.5 right-2.5 rounded-full bg-card/85 px-2 py-0.5"
              title="Imported with conflicting or missing data"
            >
              Review
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 px-1 pt-3.5">
          <h2
            className="group-hover:text-sage truncate font-serif text-[17px] leading-tight"
            title={item.name}
          >
            {item.name}
          </h2>
          <p className="eyebrow truncate">{item.brand ?? "No brand"}</p>

          <div className="mt-auto flex flex-col gap-2 pt-3.5">
            <div className="text-muted flex items-baseline justify-between text-xs tabular-nums">
              <span>{cost ?? "No cost recorded"}</span>
              <span>
                {item.timesWorn} {item.timesWorn === 1 ? "wear" : "wears"}
              </span>
            </div>
            <CostPerWearBar
              costPerWearCents={item.costPerWearCents}
              timesWorn={item.timesWorn}
              costCents={item.costCents}
            />
            {archived && item.archivedOn && (
              <p className="text-muted text-xs tabular-nums">
                Archived {item.archivedOn}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
