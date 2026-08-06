"use server";

import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getSession } from "@/lib/auth";

/** Belt-and-braces: images are already downscaled client-side to ~1200px. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function uploadPhoto(itemId: string, formData: FormData) {
  if (!(await getSession())) throw new Error("Unauthorized");

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "That doesn't look like an image." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Image is too large even after resizing." };
  }

  const [item] = await db
    .select({ imagePath: items.imagePath, name: items.name })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!item) return { error: "Item not found." };

  const slug =
    item.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "item";

  const extension = file.type === "image/webp" ? "webp" : "jpg";

  // `access: "private"` matches the store — photos are only reachable through
  // /api/photo, which checks the session first.
  const blob = await put(`items/${slug}.${extension}`, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type,
  });

  await db
    .update(items)
    .set({ imagePath: blob.pathname, updatedAt: new Date() })
    .where(eq(items.id, itemId));

  // Only after the new photo is safely recorded, so a failure never leaves the
  // item pointing at a blob that no longer exists.
  if (item.imagePath && item.imagePath !== blob.pathname) {
    await del(item.imagePath).catch(() => {});
  }

  revalidatePath("/");
  revalidatePath(`/items/${itemId}`);
  return { ok: true as const };
}

export async function removePhoto(itemId: string) {
  if (!(await getSession())) throw new Error("Unauthorized");

  const [item] = await db
    .select({ imagePath: items.imagePath })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!item?.imagePath) return { ok: true as const };

  await db
    .update(items)
    .set({ imagePath: null, updatedAt: new Date() })
    .where(eq(items.id, itemId));
  await del(item.imagePath).catch(() => {});

  revalidatePath("/");
  revalidatePath(`/items/${itemId}`);
  return { ok: true as const };
}
