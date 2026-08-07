/**
 * Placeholder catalog for building the UI before the database has data.
 *
 * The shape mirrors the `items` table exactly. Wear rows are *generated* from a
 * seed rather than listed, so times worn and cost per wear stay derived here
 * the same way they are derived in the `item_stats` view — nothing in the UI
 * gets to read a stored count.
 *
 * Delete this file once `listItems`/`getItem` in `queries.ts` hit the real db.
 */

import type { Item } from "@/db/schema";

/** An item as authored here, plus the wear-generation seed. */
type Seeded = Pick<
  Item,
  | "id"
  | "name"
  | "brand"
  | "category"
  | "tags"
  | "costCents"
  | "acquiredOn"
  | "acquiredPrecision"
  | "notes"
  | "needsReview"
> & {
  /** Range the item has been in rotation, used to place generated wears. */
  wornFrom: string;
  wornTo: string;
  wearCount: number;
};

export const seedItems: Seeded[] = [
  {
    id: "3f8a1c20-0000-4000-8000-000000000001",
    name: "Camel wool overcoat",
    brand: "Everlane",
    category: "outerwear",
    tags: ["winter", "work"],
    costCents: 26800,
    acquiredOn: "2023-11-04",
    acquiredPrecision: "day",
    notes: "Sleeves shortened 1in at Sunny's.",
    needsReview: false,
    wornFrom: "2023-11-10",
    wornTo: "2026-03-02",
    wearCount: 34,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000002",
    name: "501 straight jeans",
    brand: "Levi's",
    category: "jeans",
    tags: ["everyday"],
    costCents: 9800,
    acquiredOn: "2022-06-18",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2022-06-20",
    wornTo: "2026-08-04",
    wearCount: 61,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000003",
    name: "Silk crewneck tee",
    brand: "Quince",
    category: "tops",
    tags: ["work"],
    costCents: 4500,
    acquiredOn: "2025-09-01",
    acquiredPrecision: "day",
    notes: "Hand wash only, which is why it never gets picked.",
    needsReview: false,
    wornFrom: "2025-09-14",
    wornTo: "2026-07-21",
    wearCount: 8,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000004",
    name: "Plaid pleated skirt",
    brand: "& Other Stories",
    category: "bottoms",
    tags: ["work"],
    costCents: 6200,
    acquiredOn: "2024-02-11",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2024-02-20",
    wornTo: "2026-06-07",
    wearCount: 14,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000005",
    name: "Cashmere cardigan",
    brand: "Naadam",
    category: "sweaters",
    tags: ["winter", "work"],
    costCents: 14500,
    acquiredOn: "2024-10-30",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2024-11-05",
    wornTo: "2026-05-29",
    wearCount: 23,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000006",
    name: "Slip midi dress",
    brand: "Reformation",
    category: "dresses",
    tags: ["occasion"],
    costCents: 17800,
    acquiredOn: "2024-05-22",
    acquiredPrecision: "day",
    notes: null,
    // The 2026 audit and the original sheet disagreed on what this cost.
    needsReview: true,
    wornFrom: "2024-06-08",
    wornTo: "2026-04-18",
    wearCount: 5,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000007",
    name: "Chelsea boots",
    brand: "Blundstone",
    category: "shoes",
    tags: ["everyday", "rain"],
    costCents: 21000,
    acquiredOn: "2022-10-02",
    acquiredPrecision: "day",
    notes: "Resoled March 2025.",
    needsReview: false,
    wornFrom: "2022-10-05",
    wornTo: "2026-02-11",
    wearCount: 47,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000008",
    name: "Canvas tote",
    brand: "Baggu",
    category: "accessories",
    tags: ["everyday"],
    costCents: 3800,
    acquiredOn: "2023-01-14",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2023-01-15",
    wornTo: "2026-08-05",
    wearCount: 92,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000009",
    name: "Striped boatneck top",
    brand: "Saint James",
    category: "tops",
    tags: ["everyday"],
    // No cost recorded — one of the 60. Not zero.
    costCents: null,
    acquiredOn: "2021-01-01",
    acquiredPrecision: "year",
    notes: "Handed down. Probably around $90 new.",
    needsReview: false,
    wornFrom: "2021-03-02",
    wornTo: "2026-07-30",
    wearCount: 58,
  },
  {
    id: "3f8a1c20-0000-4000-8000-00000000000a",
    name: "Wide-leg trousers",
    brand: "Uniqlo",
    category: "bottoms",
    tags: ["work"],
    costCents: 4990,
    acquiredOn: "2025-03-08",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2025-03-12",
    wornTo: "2026-07-28",
    wearCount: 31,
  },
  {
    id: "3f8a1c20-0000-4000-8000-00000000000b",
    name: "Merino turtleneck",
    brand: "Everlane",
    category: "sweaters",
    tags: ["winter", "work"],
    costCents: 8800,
    acquiredOn: "2023-12-19",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2023-12-26",
    wornTo: "2026-03-14",
    wearCount: 29,
  },
  {
    id: "3f8a1c20-0000-4000-8000-00000000000c",
    name: "Quilted liner jacket",
    brand: "Patagonia",
    category: "outerwear",
    tags: ["everyday", "rain"],
    costCents: 19900,
    acquiredOn: "2022-11-01",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2022-11-08",
    wornTo: "2026-04-02",
    wearCount: 52,
  },
  {
    id: "3f8a1c20-0000-4000-8000-00000000000d",
    name: "Black wrap dress",
    brand: "Diane von Furstenberg",
    category: "dresses",
    tags: ["work", "occasion"],
    costCents: 39800,
    // Only the year survived the import.
    acquiredOn: "2020-01-01",
    acquiredPrecision: "year",
    notes: null,
    needsReview: false,
    wornFrom: "2020-02-14",
    wornTo: "2026-05-09",
    wearCount: 41,
  },
  {
    id: "3f8a1c20-0000-4000-8000-00000000000e",
    name: "White leather sneakers",
    brand: "Veja",
    category: "shoes",
    tags: ["everyday"],
    costCents: 15000,
    acquiredOn: "2024-04-20",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2024-04-22",
    wornTo: "2026-08-01",
    wearCount: 76,
  },
  {
    id: "3f8a1c20-0000-4000-8000-00000000000f",
    name: "Raw denim jeans",
    brand: "A.P.C.",
    category: "jeans",
    tags: ["everyday"],
    costCents: 22500,
    acquiredOn: "2025-11-15",
    acquiredPrecision: "day",
    notes: "Six months before first wash, per the tag.",
    needsReview: false,
    wornFrom: "2025-11-18",
    wornTo: "2026-07-12",
    wearCount: 19,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000010",
    name: "Ribbed tank",
    brand: "Cos",
    category: "tops",
    tags: ["summer", "workout"],
    costCents: 3500,
    acquiredOn: null,
    acquiredPrecision: "unknown",
    notes: null,
    needsReview: false,
    wornFrom: "2024-05-30",
    wornTo: "2026-07-19",
    wearCount: 44,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000011",
    name: "Cropped denim jacket",
    brand: "Madewell",
    category: "outerwear",
    tags: ["summer"],
    costCents: 11800,
    acquiredOn: "2021-05-06",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2021-05-14",
    wornTo: "2025-09-22",
    wearCount: 27,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000012",
    name: "Silk scarf",
    brand: null,
    category: "accessories",
    tags: ["occasion"],
    costCents: null,
    acquiredOn: null,
    acquiredPrecision: "unknown",
    notes: "Gift. No provenance in either sheet.",
    needsReview: false,
    wornFrom: "2023-04-01",
    wornTo: "2025-12-24",
    wearCount: 6,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000013",
    name: "Linen shirt dress",
    brand: "Mango",
    category: "dresses",
    tags: ["summer"],
    costCents: 7990,
    acquiredOn: "2025-06-11",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2025-06-15",
    wornTo: "2026-07-26",
    wearCount: 22,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000014",
    name: "Fair isle sweater",
    brand: null,
    category: "sweaters",
    tags: ["winter"],
    costCents: 6500,
    acquiredOn: "2019-01-01",
    acquiredPrecision: "year",
    notes: "Small moth hole, left cuff.",
    needsReview: false,
    wornFrom: "2019-12-01",
    wornTo: "2026-01-30",
    wearCount: 16,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000015",
    name: "Black ankle boots",
    brand: "Everlane",
    category: "shoes",
    tags: ["work"],
    costCents: 19500,
    acquiredOn: "2023-09-27",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2023-10-04",
    wornTo: "2026-03-21",
    wearCount: 38,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000016",
    name: "Corduroy midi skirt",
    brand: "Sézane",
    category: "bottoms",
    tags: ["winter"],
    costCents: 13500,
    acquiredOn: "2025-10-09",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2025-10-19",
    wornTo: "2026-02-28",
    wearCount: 9,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000017",
    name: "Oversized poplin shirt",
    brand: "Toteme",
    category: "tops",
    tags: ["work"],
    costCents: 29000,
    acquiredOn: "2026-01-16",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2026-01-24",
    wornTo: "2026-07-08",
    wearCount: 11,
  },
  {
    id: "3f8a1c20-0000-4000-8000-000000000018",
    name: "Leather crossbody",
    brand: "Polène",
    category: "accessories",
    tags: ["work", "occasion"],
    costCents: 38000,
    acquiredOn: "2024-12-03",
    acquiredPrecision: "day",
    notes: null,
    needsReview: false,
    wornFrom: "2024-12-08",
    wornTo: "2026-08-02",
    wearCount: 64,
  },
];

/* ------------------------------------------------------------------ *
 * Wear generation
 * ------------------------------------------------------------------ */

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG so the placeholder catalog never shifts. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Distinct days between `from` and `to`, matching the `wears_item_day_unique`
 * constraint. Weighted toward recent days so the wear histogram has shape.
 */
export function generateWearDates(
  itemId: string,
  count: number,
  from: string,
  to: string,
): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const span = Math.max(1, Math.round((end - start) / DAY_MS));

  const random = mulberry32(hashSeed(itemId));
  const days = new Set<number>();

  // Guard against asking for more distinct days than the range holds.
  const target = Math.min(count, span + 1);
  let guard = 0;
  while (days.size < target && guard < target * 40) {
    guard++;
    // Squaring biases the draw toward the end of the range.
    const offset = Math.round(span * (1 - random() ** 2));
    days.add(offset);
  }

  // The last recorded wear should land on `to` exactly.
  days.delete(span);
  const offsets = [...days].sort((a, b) => a - b).slice(0, target - 1);

  return [...offsets, span].map((offset) => toIsoDate(start + offset * DAY_MS));
}
