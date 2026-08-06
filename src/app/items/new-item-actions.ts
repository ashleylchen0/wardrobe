"use server";

import { asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { refineBottoms } from "@/lib/categorize";

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
    })
    .returning({ id: items.id });

  revalidatePath("/");
  revalidatePath("/log");
  return { ok: true, id: created.id };
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
