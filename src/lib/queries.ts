import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, itemStats, wears } from "@/db/schema";
import type { Category } from "@/lib/categories";

// Re-exported for server callers. Client components must import these from
// "@/lib/categories" directly — this module opens a database connection.
export { CATEGORIES, isCategory, type Category } from "@/lib/categories";

export const SORTS = {
  cpw: "Cost per wear",
  worn: "Times worn",
  cost: "Cost",
  brand: "Brand",
  name: "Name",
} as const;
export type Sort = keyof typeof SORTS;

export function isSort(v: string | undefined): v is Sort {
  return !!v && v in SORTS;
}

export const STATUSES = ["active", "archived"] as const;
export type Status = (typeof STATUSES)[number];

export function isStatus(v: string | undefined): v is Status {
  return !!v && (STATUSES as readonly string[]).includes(v);
}

export async function getClosetItems({
  category: cat,
  sort = "worn",
  status = "active",
}: {
  category?: Category;
  sort?: Sort;
  status?: Status;
}) {
  // Items with no cost, or never worn, have no cost per wear — they sort last
  // rather than masquerading as $0.00.
  const orderBy = {
    cpw: [sql`${itemStats.costPerWearCents} ASC NULLS LAST`],
    worn: [desc(itemStats.timesWorn), asc(items.name)],
    cost: [sql`${items.costCents} DESC NULLS LAST`],
    brand: [sql`${items.brand} ASC NULLS LAST`, asc(items.name)],
    name: [asc(items.name)],
  }[sort];

  const query = db
    .select({
      id: items.id,
      name: items.name,
      brand: items.brand,
      category: items.category,
      tags: items.tags,
      costCents: items.costCents,
      imagePath: items.imagePath,
      needsReview: items.needsReview,
      status: items.status,
      archivedOn: items.archivedOn,
      timesWorn: itemStats.timesWorn,
      costPerWearCents: itemStats.costPerWearCents,
      lastWorn: itemStats.lastWorn,
    })
    .from(items)
    .innerJoin(itemStats, eq(itemStats.itemId, items.id))
    .$dynamic();

  query.where(cat ? and(eq(items.status, status), eq(items.category, cat)) : eq(items.status, status));

  return query.orderBy(...orderBy);
}

/** Counts within the given status, so the chips match what the grid will show. */
export async function getCategoryCounts(status: Status = "active") {
  const rows = await db
    .select({ category: items.category, count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.status, status))
    .groupBy(items.category);
  return new Map(rows.map((r) => [r.category, r.count]));
}

export async function getStatusCounts() {
  const rows = await db
    .select({ status: items.status, count: sql<number>`count(*)::int` })
    .from(items)
    .groupBy(items.status);
  return new Map(rows.map((r) => [r.status, r.count]));
}

export async function getItem(id: string) {
  const [row] = await db
    .select({
      item: items,
      timesWorn: itemStats.timesWorn,
      costPerWearCents: itemStats.costPerWearCents,
      firstWorn: itemStats.firstWorn,
      lastWorn: itemStats.lastWorn,
    })
    .from(items)
    .innerJoin(itemStats, eq(itemStats.itemId, items.id))
    .where(eq(items.id, id))
    .limit(1);

  if (!row) return null;

  const history = await db
    .select({ wornOn: wears.wornOn, slot: wears.slot })
    .from(wears)
    .where(eq(wears.itemId, id))
    .orderBy(desc(wears.wornOn));

  return { ...row, history };
}

/**
 * Everything selectable when logging an outfit: the current closet, plus any
 * archived item already logged on that date — you can edit a day from before
 * you gave something away without it vanishing from the picker.
 */
export async function getPickableItems(date: string) {
  return db
    .select({
      id: items.id,
      name: items.name,
      brand: items.brand,
      category: items.category,
      imagePath: items.imagePath,
      status: items.status,
      timesWorn: itemStats.timesWorn,
      costPerWearCents: itemStats.costPerWearCents,
      lastWorn: itemStats.lastWorn,
    })
    .from(items)
    .innerJoin(itemStats, eq(itemStats.itemId, items.id))
    .where(
      or(
        eq(items.status, "active"),
        sql`exists (select 1 from ${wears} w where w.item_id = ${items.id} and w.worn_on = ${date})`,
      ),
    )
    .orderBy(asc(items.name));
}

export async function getOutfitForDate(date: string) {
  const rows = await db
    .select({ itemId: wears.itemId })
    .from(wears)
    .where(eq(wears.wornOn, date));
  return rows.map((r) => r.itemId);
}

/** Recent days that have any wears, for the "jump back" list. */
export async function getRecentLoggedDates(limit = 7) {
  const rows = await db
    .select({ wornOn: wears.wornOn, count: sql<number>`count(*)::int` })
    .from(wears)
    .groupBy(wears.wornOn)
    .orderBy(desc(wears.wornOn))
    .limit(limit);
  return rows;
}

export type PickableItem = Awaited<ReturnType<typeof getPickableItems>>[number];
export type ClosetItem = Awaited<ReturnType<typeof getClosetItems>>[number];
