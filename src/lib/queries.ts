import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, itemStats, wears } from "@/db/schema";
import type { Category } from "@/lib/categories";

// Re-exported for server callers. Client components must import these from
// "@/lib/categories" directly — this module opens a database connection.
export { CATEGORIES, isCategory, type Category } from "@/lib/categories";

export const SORTS = {
  worn: "Most worn",
  recent: "Recently worn",
  cpw: "Cost/wear low → high",
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
    // Never-worn items have no last wear date; they belong at the end rather
    // than at the top of a list about recency.
    recent: [sql`${itemStats.lastWorn} DESC NULLS LAST`, asc(items.name)],
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

/**
 * Wear counts per day across a month, plus the categories worn, so a cell can
 * show what kind of day it was without loading every item.
 */
export async function getMonthCoverage(from: string, to: string) {
  const rows = await db
    .select({
      wornOn: wears.wornOn,
      count: sql<number>`count(*)::int`,
      categories: sql<string[]>`array_agg(distinct ${items.category}::text)`,
    })
    .from(wears)
    .innerJoin(items, eq(items.id, wears.itemId))
    .where(sql`${wears.wornOn} >= ${from} and ${wears.wornOn} <= ${to}`)
    .groupBy(wears.wornOn);

  return new Map(rows.map((r) => [r.wornOn, r]));
}

/** Logged-day totals per month, for the year strip and the header stats. */
export async function getMonthlyTotals(year: number) {
  return db
    .select({
      month: sql<string>`to_char(${wears.wornOn}, 'YYYY-MM')`,
      days: sql<number>`count(distinct ${wears.wornOn})::int`,
      wears: sql<number>`count(*)::int`,
    })
    .from(wears)
    .where(sql`extract(year from ${wears.wornOn}) = ${year}`)
    .groupBy(sql`to_char(${wears.wornOn}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${wears.wornOn}, 'YYYY-MM')`);
}

/** Years that have any wears, for the year switcher. */
export async function getLoggedYears() {
  const rows = await db
    .select({ year: sql<number>`extract(year from ${wears.wornOn})::int` })
    .from(wears)
    .groupBy(sql`extract(year from ${wears.wornOn})`)
    .orderBy(sql`extract(year from ${wears.wornOn})`);
  return rows.map((r) => r.year);
}

export type PickableItem = Awaited<ReturnType<typeof getPickableItems>>[number];
export type ClosetItem = Awaited<ReturnType<typeof getClosetItems>>[number];
