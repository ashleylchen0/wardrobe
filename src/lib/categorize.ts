import type { category } from "@/db/schema";

type Category = (typeof category.enumValues)[number];

/**
 * The source sheets used "Jeans", "Bottoms" and "Pants" inconsistently — the
 * same garment was filed differently in different years. Ashley's rule: `jeans`
 * means full-length denim trousers. Denim shorts and denim skirts are bottoms,
 * as is anything in another material.
 *
 * Only applies within jeans/bottoms; a denim jacket or denim tank keeps its own
 * category.
 */
export function refineBottoms(name: string, current: Category): Category {
  if (current !== "jeans" && current !== "bottoms") return current;

  const n = name.toLowerCase();
  const isDenim = /\b(denim|jeans)\b/.test(n);
  const isShortOrSkirt = /\b(shorts?|skirts?|skort)\b/.test(n);

  return isDenim && !isShortOrSkirt ? "jeans" : "bottoms";
}
