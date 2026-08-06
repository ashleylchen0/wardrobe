"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { wears } from "@/db/schema";
import { getSession } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Adding or removing a wear is the only write. Times worn and cost per wear
 * are counted from this table by the `item_stats` view, so they update
 * everywhere without a counter to keep in sync.
 */
export async function setWear(itemId: string, date: string, worn: boolean) {
  if (!(await getSession())) throw new Error("Unauthorized");
  if (!DATE_RE.test(date)) throw new Error("Bad date");

  if (worn) {
    // The (item_id, worn_on) unique index makes a double-tap a no-op.
    await db
      .insert(wears)
      .values({ itemId, wornOn: date, source: "app" })
      .onConflictDoNothing();
  } else {
    await db
      .delete(wears)
      .where(and(eq(wears.itemId, itemId), eq(wears.wornOn, date)));
  }

  revalidatePath("/log");
  revalidatePath("/");
  revalidatePath(`/items/${itemId}`);
}
