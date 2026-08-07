import type { Category } from "@/lib/categories";

/**
 * Stand-in artwork for items with no photo. Set greyscale at low opacity so a
 * grid of them reads as texture rather than as a row of stickers — the Archive
 * has no color outside cost per wear.
 */
const CATEGORY_EMOJI: Record<Category, string> = {
  tops: "👕",
  sweaters: "🧶",
  bottoms: "🩳",
  jeans: "👖",
  dresses: "👗",
  outerwear: "🧥",
  shoes: "👟",
  accessories: "👜",
};

export function categoryEmoji(category: Category): string {
  return CATEGORY_EMOJI[category] ?? "👕";
}

/** "Jul 7, 2026". Parsed as UTC so a local timezone can't shift the day. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Grouped, so four-figure totals on the stats page don't read as one long run. */
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Cost is stored in cents; null means unrecorded, which is not the same as $0. */
export function money(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return dollars(cents);
}

/** The view returns numeric as a string to avoid float rounding. */
export function moneyFromNumeric(value: string | null): string | null {
  if (value === null) return null;
  return dollars(Number(value));
}
