/**
 * Collapses brands that differ only by case or surrounding whitespace.
 *
 *   npx tsx scripts/merge-brands.ts            # dry run
 *   npx tsx scripts/merge-brands.ts --commit
 *
 * Four years of hand-typing left "UNIQLO" and "Uniqlo" as separate brands
 * splitting 28 items across a filter that should show one. The winning spelling
 * is whichever is most common, with Title Case breaking ties.
 *
 * The add-item form autocompletes from existing brands, which is what stops
 * this recurring.
 */
import { eq, isNotNull } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { items } from "../src/db/schema";

const COMMIT = process.argv.includes("--commit");

const isTitleCase = (s: string) => /^[A-Z]/.test(s) && s !== s.toUpperCase();

async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

  const rows = await db
    .select({ brand: items.brand })
    .from(items)
    .where(isNotNull(items.brand));

  const counts = new Map<string, number>();
  for (const r of rows) {
    const b = r.brand!;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }

  const groups = new Map<string, string[]>();
  for (const brand of counts.keys()) {
    const k = brand.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), brand]);
  }

  const merges: { from: string; to: string; moved: number }[] = [];
  for (const variants of groups.values()) {
    if (variants.length < 2) continue;

    const winner = [...variants].sort((a, b) => {
      const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      if (byCount !== 0) return byCount;
      if (isTitleCase(a) !== isTitleCase(b)) return isTitleCase(a) ? -1 : 1;
      return a.localeCompare(b);
    })[0];

    for (const v of variants) {
      if (v !== winner) merges.push({ from: v, to: winner, moved: counts.get(v) ?? 0 });
    }
  }

  console.log(`\nBrands: ${counts.size} distinct, ${groups.size} after merging\n`);
  for (const m of merges) {
    console.log(`  "${m.from}" (${m.moved}) -> "${m.to}" (${counts.get(m.to)})`);
  }

  if (!COMMIT) {
    console.log("\nDry run — nothing written. Re-run with --commit.\n");
    return;
  }

  let moved = 0;
  for (const m of merges) {
    await db
      .update(items)
      .set({ brand: m.to, updatedAt: new Date() })
      .where(eq(items.brand, m.from));
    moved += m.moved;
  }
  console.log(`\nRewrote ${moved} items across ${merges.length} spellings.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
