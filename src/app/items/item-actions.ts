"use server";

import { put } from "@vercel/blob";
import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { refineBottoms } from "@/lib/categorize";
import { normalizePhoto } from "@/lib/knockout";

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string; suggestion?: string };

const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const schema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(120),
  category: z.enum(CATEGORIES),
  brand: z.string().trim().max(80).optional(),
  /** Dollars as typed; stored as cents. Blank stays null — not $0. */
  cost: z.string().trim().optional(),
  acquiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  productUrl: z.string().trim().url("That doesn't look like a link.").optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
  tags: z.string().trim().optional(),
  /** A listing's preview image, resolved by `fetchProductImage`. */
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
});

/**
 * `name_key` is unique, so a second "white tee" fails at the database. Rather
 * than surfacing a constraint error, suggest the convention already in use —
 * `white baby tee` / `white baby tee 2`.
 */
async function suggestFreeName(base: string): Promise<string> {
  for (let n = 2; n < 20; n++) {
    const candidate = `${base} ${n}`;
    const [taken] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.nameKey, nameKey(candidate)))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/** Listing images are already web-sized; anything larger is a mistake. */
const MAX_REMOTE_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Copies a listing's image into our own store rather than linking it — the
 * whole reason for in-app photos is that shop images vanish when something
 * sells out, and a hotlink would rot the same way.
 *
 * Deliberately fetch-then-put rather than the SDK's `putFromUrl`: that call
 * hangs indefinitely against this store, ignoring its own abort signal.
 */
async function storeRemoteImage(
  name: string,
  imageUrl: string,
): Promise<string | null> {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "item";

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "image/*" },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_REMOTE_IMAGE_BYTES) {
      return null;
    }

    // Listing images arrive on whatever studio backdrop the retailer shoots
    // against, and a grid of six different greys reads as noise. Cutting the
    // background here is what keeps a linked photo looking like every other
    // tile. Falls back to a plain resize when the backdrop isn't flat.
    const { buffer } = await normalizePhoto(Buffer.from(bytes));

    const blob = await put(`items/${slug}.webp`, buffer, {
      access: "private",
      addRandomSuffix: true,
      contentType: "image/webp",
    });
    return blob.pathname;
  } catch {
    // A failed image must never cost you the item.
    return null;
  }
}

export async function createItem(formData: FormData): Promise<CreateResult> {
  if (!(await getSession())) throw new Error("Unauthorized");

  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    category: formData.get("category") ?? "",
    brand: formData.get("brand") ?? undefined,
    cost: formData.get("cost") ?? undefined,
    acquiredOn: formData.get("acquiredOn") ?? "",
    productUrl: formData.get("productUrl") ?? "",
    notes: formData.get("notes") ?? undefined,
    tags: formData.get("tags") ?? undefined,
    imageUrl: formData.get("imageUrl") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const key = nameKey(v.name);
  const [existing] = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(eq(items.nameKey, key))
    .limit(1);

  if (existing) {
    return {
      ok: false,
      error: `You already have "${existing.name}".`,
      suggestion: await suggestFreeName(v.name.trim()),
    };
  }

  // Blank cost means unrecorded, which is not the same as free.
  let costCents: number | null = null;
  if (v.cost) {
    const n = Number(v.cost.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Cost should be a number, or left blank." };
    }
    costCents = Math.round(n * 100);
  }

  const tags = (v.tags ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const imagePath = v.imageUrl ? await storeRemoteImage(v.name, v.imageUrl) : null;

  const [created] = await db
    .insert(items)
    .values({
      name: v.name.trim(),
      nameKey: key,
      brand: v.brand || null,
      category: refineBottoms(v.name, v.category),
      tags,
      costCents,
      acquiredOn: v.acquiredOn || null,
      acquiredPrecision: v.acquiredOn ? "day" : "unknown",
      productUrl: v.productUrl || null,
      notes: v.notes || null,
      imagePath,
    })
    .returning({ id: items.id });

  revalidatePath("/");
  revalidatePath("/log");
  return { ok: true, id: created.id };
}

/**
 * Edit an existing item. Same shape as `createItem`, with three differences
 * that matter:
 *
 * - the name-collision check excludes the item itself, or saving without
 *   renaming would always report a duplicate of itself;
 * - `refineBottoms` is not applied — on create it guesses jeans from a name,
 *   but here you have picked a category explicitly and a guess must not
 *   overrule you;
 * - a blank date field does not always mean "clear the date". 36 items were
 *   imported knowing only the year, and a date input cannot show a year. Those
 *   arrive with the field blank, so the original is preserved unless you
 *   actively set a new one.
 */
export async function updateItem(
  id: string,
  formData: FormData,
): Promise<CreateResult> {
  if (!(await getSession())) throw new Error("Unauthorized");

  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    category: formData.get("category") ?? "",
    brand: formData.get("brand") ?? undefined,
    cost: formData.get("cost") ?? undefined,
    acquiredOn: formData.get("acquiredOn") ?? "",
    productUrl: formData.get("productUrl") ?? "",
    notes: formData.get("notes") ?? undefined,
    tags: formData.get("tags") ?? undefined,
    imageUrl: formData.get("imageUrl") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const [current] = await db
    .select({
      acquiredOn: items.acquiredOn,
      acquiredPrecision: items.acquiredPrecision,
      imagePath: items.imagePath,
    })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);
  if (!current) return { ok: false, error: "That item no longer exists." };

  const key = nameKey(v.name);
  const [clash] = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(and(eq(items.nameKey, key), ne(items.id, id)))
    .limit(1);

  if (clash) {
    return {
      ok: false,
      error: `You already have "${clash.name}".`,
      suggestion: await suggestFreeName(v.name.trim()),
    };
  }

  let costCents: number | null = null;
  if (v.cost) {
    const n = Number(v.cost.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Cost should be a number, or left blank." };
    }
    costCents = Math.round(n * 100);
  }

  const tags = (v.tags ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // A year-only date survives an untouched form; anything else follows the field.
  const keepYearOnly =
    !v.acquiredOn && current.acquiredPrecision === "year" && current.acquiredOn;
  const acquiredOn = v.acquiredOn || (keepYearOnly ? current.acquiredOn : null);
  const acquiredPrecision = v.acquiredOn
    ? "day"
    : keepYearOnly
      ? "year"
      : "unknown";

  // A newly fetched listing image replaces the stored one; a failed fetch
  // leaves whatever was already there.
  const fetched = v.imageUrl ? await storeRemoteImage(v.name, v.imageUrl) : null;

  await db
    .update(items)
    .set({
      name: v.name.trim(),
      nameKey: key,
      brand: v.brand || null,
      category: v.category,
      tags,
      costCents,
      acquiredOn,
      acquiredPrecision,
      productUrl: v.productUrl || null,
      notes: v.notes || null,
      imagePath: fetched ?? current.imagePath,
    })
    .where(eq(items.id, id));

  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/stats");
  revalidatePath(`/items/${id}`);
  return { ok: true, id };
}

/** Existing spellings, so the form autocompletes instead of inventing new ones. */
export async function getBrands(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ brand: items.brand })
    .from(items)
    .where(isNotNull(items.brand))
    .orderBy(asc(items.brand));
  return rows.map((r) => r.brand!).filter(Boolean);
}
