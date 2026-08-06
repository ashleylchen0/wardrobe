/**
 * The garment vocabulary, kept free of any database import so client
 * components can use it. `src/lib/queries.ts` opens a Neon connection at module
 * load, so importing category values from there pulls the driver into the
 * browser bundle and fails with "No database connection string".
 *
 * `db/schema.ts` builds its pgEnum from this list, so there is still one source
 * of truth.
 */
export const CATEGORIES = [
  "tops",
  "sweaters",
  "bottoms",
  "jeans",
  "dresses",
  "outerwear",
  "shoes",
  "accessories",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: string | undefined): v is Category {
  return !!v && (CATEGORIES as readonly string[]).includes(v);
}
