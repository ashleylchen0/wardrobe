import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, items, itemStats, wears } from "@/db/schema";

export const CATEGORIES = category.enumValues;
export type Category = (typeof CATEGORIES)[number];

export const SORTS = {
  cpw: "Cost per wear",
  worn: "Times worn",
  cost: "Cost",
  brand: "Brand",
  name: "Name",
} as const;
export type Sort = keyof typeof SORTS;

export function isCategory(v: string | undefined): v is Category {
  return !!v && (CATEGORIES as readonly string[]).includes(v);
}

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

export type ClosetItem = Awaited<ReturnType<typeof getClosetItems>>[number];
