/**
 * Sort keys and their labels, kept free of any database import so the toolbar
 * can use them. `src/lib/queries.ts` opens a Neon connection at module load, so
 * importing these from there pulls the driver into the browser bundle — the
 * same reason the category list lives in its own file.
 *
 * The ascending twins exist so the register table's column headers can toggle
 * direction; the select shows all of them.
 */
export const SORTS = {
  worn: "Most worn",
  "worn-asc": "Least worn",
  recent: "Recently worn",
  cpw: "Cost/wear low → high",
  "cpw-desc": "Cost/wear high → low",
  cost: "Cost",
  newest: "Newest",
  brand: "Brand",
  name: "Name",
} as const;

export type Sort = keyof typeof SORTS;

/** Matches the default in `ClosetPage`, and so is the value omitted from URLs. */
export const DEFAULT_SORT: Sort = "worn";

export function isSort(v: string | undefined): v is Sort {
  return !!v && v in SORTS;
}
