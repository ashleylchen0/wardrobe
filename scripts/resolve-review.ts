/**
 * Clears the 33 items flagged `needsReview` by the import.
 *
 *   npx tsx scripts/resolve-review.ts            # dry run
 *   npx tsx scripts/resolve-review.ts --commit
 *
 * Decisions applied, all Ashley's:
 *  - jeans vs bottoms is settled by name (see `refineBottoms`), not by whichever
 *    sheet happened to be edited last.
 *  - every other category disagreement already resolved to the newest sheet's
 *    value during import, which was right in each case — only the flag remains.
 *  - cost disagreements keep the newest value; the ALL TIME column was stale.
 *    `white baby tee` stays $10 (its $15 entry predates the split into
 *    `white baby tee` and `white baby tee 2`).
 *  - the three log-only stubs are confirmed real items; unknown cost is not
 *    itself review-worthy, since 60 other items have none.
 *
 * `importConflicts` is left in place as provenance — it is only surfaced in the
 * UI while `needsReview` is true.
 */
import { eq, inArray, or } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { items } from "../src/db/schema";
import { refineBottoms } from "../src/lib/categorize";

const COMMIT = process.argv.includes("--commit");

async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

  const bottoms = await db
    .select({ id: items.id, name: items.name, category: items.category })
    .from(items)
    .where(or(eq(items.category, "jeans"), eq(items.category, "bottoms")));

  const moves = bottoms
    .map((i) => ({ ...i, want: refineBottoms(i.name, i.category) }))
    .filter((i) => i.want !== i.category);

  const flagged = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(eq(items.needsReview, true));

  console.log(`\nRecategorise ${moves.length} items:`);
  for (const m of moves) {
    console.log(`   ${m.category.padEnd(8)} -> ${m.want.padEnd(8)} ${m.name}`);
  }
  console.log(`\nClear review flag on ${flagged.length} items.`);

  if (!COMMIT) {
    console.log("\nDry run — nothing written. Re-run with --commit.\n");
    return;
  }

  for (const m of moves) {
    await db
      .update(items)
      .set({ category: m.want, updatedAt: new Date() })
      .where(eq(items.id, m.id));
  }

  if (flagged.length) {
    await db
      .update(items)
      .set({ needsReview: false, updatedAt: new Date() })
      .where(
        inArray(
          items.id,
          flagged.map((f) => f.id),
        ),
      );
  }

  console.log(`\nMoved ${moves.length} items, cleared ${flagged.length} flags.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
