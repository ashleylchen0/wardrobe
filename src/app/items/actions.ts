"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getSession } from "@/lib/auth";

/**
 * Archive = donated, sold, or otherwise gone. Wear history is deliberately
 * left intact so cost per wear stays true for things you no longer own.
 */
export async function setArchived(itemId: string, archived: boolean) {
  if (!(await getSession())) throw new Error("Unauthorized");

  await db
    .update(items)
    .set({
      status: archived ? "archived" : "active",
      archivedOn: archived ? new Date().toISOString().slice(0, 10) : null,
      updatedAt: new Date(),
    })
    .where(eq(items.id, itemId));

  revalidatePath("/");
  revalidatePath(`/items/${itemId}`);
}
