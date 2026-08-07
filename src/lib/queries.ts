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
 * Recent logged days with the pieces worn on each, for the sidebar. One query
 * rather than one per day: the list is short, but N+1 over a wear log is the
 * kind of thing that only hurts once the log is long.
 */
export async function getRecentDays(limit = 7) {
  const rows = await db
    .select({
      wornOn: wears.wornOn,
      itemId: items.id,
      name: items.name,
    })
    .from(wears)
    .innerJoin(items, eq(items.id, wears.itemId))
    .where(
      sql`${wears.wornOn} in (
        select distinct worn_on from ${wears} order by worn_on desc limit ${limit}
      )`,
    )
    .orderBy(desc(wears.wornOn), asc(items.name));

  const days = new Map<string, { itemId: string; name: string }[]>();
  for (const r of rows) {
    const entries = days.get(r.wornOn) ?? [];
    entries.push({ itemId: r.itemId, name: r.name });
    days.set(r.wornOn, entries);
  }
  return [...days.entries()].map(([date, entries]) => ({ date, entries }));
}

/**
 * Wear counts per day across a month, plus the categories worn, so a cell can
 * show what kind of day it was without loading every item.
 */
export async function getMonthCoverage(from: string, to: string) {
  const rows = await db
    .select({
      wornOn: wears.wornOn,
      itemId: items.id,
      name: items.name,
      category: items.category,
      imagePath: items.imagePath,
    })
    .from(wears)
    .innerJoin(items, eq(items.id, wears.itemId))
    .where(sql`${wears.wornOn} >= ${from} and ${wears.wornOn} <= ${to}`)
    .orderBy(asc(wears.wornOn), asc(items.name));

  const days = new Map<string, { count: number; entries: typeof rows }>();
  for (const r of rows) {
    const day = days.get(r.wornOn) ?? { count: 0, entries: [] };
    day.count += 1;
    day.entries.push(r);
    days.set(r.wornOn, day);
  }
  return days;
}

export type MonthDay = NonNullable<
  Awaited<ReturnType<typeof getMonthCoverage>> extends Map<string, infer V> ? V : never
>;

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

/**
 * The stats page counts only the closet as it stands today.
 *
 * Every query below is scoped to `status = 'active'`, archived pieces and their
 * wear history included — the page is meant to answer "what am I getting out of
 * what I own", and a donated coat's 60 wears flatter an average that no longer
 * describes anything. The wear rows stay in the database either way; they are
 * still counted on the item's own page and in the calendar.
 */
export async function getStatsItems() {
  return db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      status: items.status,
      costCents: items.costCents,
      timesWorn: itemStats.timesWorn,
      costPerWearCents: itemStats.costPerWearCents,
    })
    .from(items)
    .innerJoin(itemStats, eq(itemStats.itemId, items.id))
    .where(eq(items.status, "active"));
}

/** Wears, and days on which something still in the closet was worn. */
export async function getWearTotals() {
  const [row] = await db
    .select({
      totalWears: sql<number>`count(*)::int`,
      totalDays: sql<number>`count(distinct ${wears.wornOn})::int`,
    })
    .from(wears)
    .innerJoin(items, eq(items.id, wears.itemId))
    .where(eq(items.status, "active"));
  return row ?? { totalWears: 0, totalDays: 0 };
}

export async function getWearsByYear() {
  return db
    .select({
      year: sql<number>`extract(year from ${wears.wornOn})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(wears)
    .innerJoin(items, eq(items.id, wears.itemId))
    .where(eq(items.status, "active"))
    .groupBy(sql`extract(year from ${wears.wornOn})`)
    .orderBy(sql`extract(year from ${wears.wornOn})`);
}

export type PickableItem = Awaited<ReturnType<typeof getPickableItems>>[number];
export type ClosetItem = Awaited<ReturnType<typeof getClosetItems>>[number];
export type StatsItem = Awaited<ReturnType<typeof getStatsItems>>[number];
