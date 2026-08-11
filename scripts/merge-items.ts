/**
 * Collapses two records of the same garment into one.
 *
 *   npx tsx --env-file=.env.local scripts/merge-items.ts "keep this" "drop this"
 *   npx tsx --env-file=.env.local scripts/merge-items.ts "keep this" "drop this" --commit
 *
 * The import brought the same pair of shoes in twice under different names, and
 * each copy collected its own wear history, so neither cost-per-wear was right.
 * Merging moves the wears onto the surviving item and fills in whatever fields
 * it is missing — an acquisition date on one copy and a photo on the other are
 * both worth keeping.
 *
 * Wears are unique per item per day. Where both copies record the same day, the
 * survivor's row stands and the duplicate's is dropped: they are the same
 * garment worn once, not twice.
 */
import { and, eq, inArray } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { items, wears } from "../src/db/schema";

const COMMIT = process.argv.includes("--commit");
const [keepName, dropName] = process.argv.slice(2).filter((a) => a !== "--commit");

/**
 * Fields worth rescuing from the record being dropped, if the survivor lacks
 * them. `costCents` is not among them: zero is a real price for a gift or a
 * hand-me-down, so there is no value that reliably means "unset" to fill in.
 */
const INHERITED = [
  "brand",
  "acquiredOn",
  "acquiredPrecision",
  "imagePath",
  "tags",
] as const;

function describe(item: typeof items.$inferSelect) {
  return [
    item.name,
    item.brand ?? "no brand",
    item.costCents ? `$${(item.costCents / 100).toFixed(2)}` : "no cost",
    item.acquiredOn ? `acquired ${item.acquiredOn}` : "no acquisition date",
    item.imagePath ? "has a photo" : "no photo",
    item.notes ? `notes: ${item.notes}` : "no notes",
  ].join(" · ");
}

async function main() {
  if (!keepName || !dropName) {
    console.error('Usage: merge-items.ts "<item to keep>" "<item to drop>" [--commit]');
    process.exit(1);
  }

  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

  const found = await db
    .select()
    .from(items)
    .where(inArray(items.name, [keepName, dropName]));

  const keep = found.find((i) => i.name === keepName);
  const drop = found.find((i) => i.name === dropName);
  if (!keep || !drop) {
    console.error(`No item named "${!keep ? keepName : dropName}"`);
    process.exit(1);
  }

  console.log(`keeping  ${describe(keep)}`);
  console.log(`dropping ${describe(drop)}\n`);

  const keepWears = await db.select().from(wears).where(eq(wears.itemId, keep.id));
  const dropWears = await db.select().from(wears).where(eq(wears.itemId, drop.id));

  const held = new Set(keepWears.map((w) => w.wornOn));
  const moving = dropWears.filter((w) => !held.has(w.wornOn));
  const colliding = dropWears.length - moving.length;

  console.log(
    `wears: ${keepWears.length} kept + ${moving.length} moved` +
      (colliding ? ` (${colliding} already on the same day, dropped)` : "") +
      ` = ${keepWears.length + moving.length}`,
  );

  const filling = INHERITED.filter((field) => {
    const mine = keep[field];
    const theirs = drop[field];
    const empty = mine === null || mine === undefined || mine === "";
    return empty && theirs !== null && theirs !== undefined && theirs !== "";
  });

  for (const field of filling) console.log(`taking ${field}: ${drop[field]}`);

  // Notes are the one field where both copies can be right — "from rachel" on
  // one and "gift" on the other are two halves of the same story — so they are
  // joined rather than chosen between.
  const notes = [keep.notes, drop.notes]
    .map((n) => n?.trim())
    .filter((n): n is string => !!n)
    .filter((n, i, all) => all.indexOf(n) === i);
  const mergedNotes = notes.join(" · ");
  if (mergedNotes !== (keep.notes ?? "")) console.log(`notes: ${mergedNotes}`);

  if (!COMMIT) {
    console.log("\nDry run — nothing written. Re-run with --commit.\n");
    return;
  }

  if (moving.length) {
    await db
      .update(wears)
      .set({ itemId: keep.id })
      .where(
        and(
          eq(wears.itemId, drop.id),
          inArray(
            wears.id,
            moving.map((w) => w.id),
          ),
        ),
      );
  }

  const patch = Object.fromEntries(filling.map((f) => [f, drop[f]]));
  await db
    .update(items)
    .set({ ...patch, notes: mergedNotes || null, updatedAt: new Date() })
    .where(eq(items.id, keep.id));

  // The remaining wears cascade with the row. The blob stays put when the photo
  // was inherited: it is the same object, now pointed at by the survivor.
  await db.delete(items).where(eq(items.id, drop.id));

  console.log(`\nMerged "${drop.name}" into "${keep.name}".\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
