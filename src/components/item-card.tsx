import Link from "next/link";

import { CostPerWear } from "@/components/cost-per-wear";
import { ItemPhoto } from "@/components/item-photo";
import type { ClosetItem } from "@/lib/queries";

/**
 * No border, no fill, no shadow: the card is the photo well plus three lines of
 * type on bare paper. Separation in the grid comes from the gap and from the
 * tile, the way it does on a contact sheet.
 */
export function ItemCard({ item }: { item: ClosetItem }) {
  const archived = item.status === "archived";

  return (
    <li className="flex">
      <Link href={`/items/${item.id}`} className="group block w-full">
        <div className="relative">
          <ItemPhoto
            name={item.name}
            imagePath={item.imagePath}
            category={item.category}
            className={`aspect-[3/4] ${archived ? "opacity-55 grayscale" : ""}`}
          />
          {archived && (
            <span className="microcap bg-ink text-paper absolute top-0 left-0 px-1.5 py-0.5 text-[8px]">
              Archived
            </span>
          )}
          {item.needsReview && (
            <span
              className="microcap text-cpw-bad bg-paper absolute top-0 right-0 px-1.5 py-0.5 text-[8px]"
              title="Imported with conflicting or missing data"
            >
              Review
            </span>
          )}
        </div>

        <div className="microcap mt-2 truncate text-[11px] font-bold leading-tight group-hover:underline">
          {item.name}
        </div>
        <div className="microcap text-muted truncate text-[10px]">
          {item.brand ?? "—"}
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums">
          <CostPerWear
            costPerWearCents={item.costPerWearCents}
            timesWorn={item.timesWorn}
            costCents={item.costCents}
          />
          <span className="text-muted"> · {item.timesWorn}×</span>
        </div>
      </Link>
    </li>
  );
}
