import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Garment type. The spreadsheet used ten overlapping values — `Pants` and
 * `Jeans` both alongside `Bottoms`, and `Workout` describing use rather than
 * garment. Pants folds into bottoms; workout becomes a tag.
 */
export const category = pgEnum("category", [
  "tops",
  "sweaters",
  "bottoms",
  "jeans",
  "dresses",
  "outerwear",
  "shoes",
  "accessories",
]);

/**
 * How much of `acquiredOn` is real. The sheet had 162 full dates, 36 entries
 * that were only a year, and 29 blank or "--", so a plain date column would
 * silently invent January 1st for a quarter of the catalog.
 */
export const acquiredPrecision = pgEnum("acquired_precision", [
  "day",
  "year",
  "unknown",
]);

export const itemStatus = pgEnum("item_status", ["active", "archived"]);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** lower(trim(name)) — how outfit log rows resolve to an item. */
    nameKey: text("name_key").notNull(),
    brand: text("brand"),
    category: category("category").notNull(),
    tags: text("tags").array().notNull().default([]),

    /** Null is meaningful: 60 items have no recorded cost, which is not $0. */
    costCents: integer("cost_cents"),

    acquiredOn: date("acquired_on"),
    acquiredPrecision: acquiredPrecision("acquired_precision")
      .notNull()
      .default("unknown"),

    notes: text("notes"),

    /** Blob pathname, not a URL — the store is private and served via /api/photo. */
    imagePath: text("image_path"),
    productUrl: text("product_url"),

    /** Archived = donated, sold, or otherwise gone. Wear history is kept. */
    status: itemStatus("status").notNull().default("active"),
    archivedOn: date("archived_on"),

    /** Set on import where source sheets disagreed; drives the review screen. */
    needsReview: boolean("needs_review").notNull().default(false),
    /** e.g. { "costCents": [{ "source": "2026 Audit", "value": 1500 }, ...] } */
    importConflicts: jsonb("import_conflicts"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("items_name_key_unique").on(t.nameKey),
    index("items_category_idx").on(t.category),
    index("items_needs_review_idx").on(t.needsReview),
  ],
);

/**
 * Old spellings and renames, so historical log rows keep resolving. The sheet
 * renamed "pleated skirt" to "plaid pleated skirt" partway through 2025.
 */
export const itemAliases = pgTable(
  "item_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    aliasKey: text("alias_key").notNull(),
  },
  (t) => [unique("item_aliases_alias_key_unique").on(t.aliasKey)],
);

export const wearSource = pgEnum("wear_source", ["import", "app"]);

/**
 * One row per item per day. Times worn and cost per wear are derived by
 * counting these — never stored — which is what keeps them from drifting the
 * way the spreadsheet's cached COUNTIF values did.
 */
export const wears = pgTable(
  "wears",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    wornOn: date("worn_on").notNull(),
    /** Original spreadsheet column (Pants, Top, Layer…). Provenance only. */
    slot: text("slot"),
    source: wearSource("source").notNull().default("app"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("wears_item_day_unique").on(t.itemId, t.wornOn),
    index("wears_worn_on_idx").on(t.wornOn),
    index("wears_item_id_idx").on(t.itemId),
  ],
);

/**
 * Created in drizzle/0001_item_stats_view.sql. Declared here with `.existing()`
 * so queries are typed without drizzle-kit trying to manage the DDL.
 */
export const itemStats = pgView("item_stats", {
  itemId: uuid("item_id").notNull(),
  timesWorn: integer("times_worn").notNull(),
  costPerWearCents: numeric("cost_per_wear_cents"),
  firstWorn: date("first_worn"),
  lastWorn: date("last_worn"),
}).existing();

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Wear = typeof wears.$inferSelect;
export type NewWear = typeof wears.$inferInsert;
