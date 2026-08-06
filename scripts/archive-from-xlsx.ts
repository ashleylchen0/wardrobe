/**
 * Archives items that Ashley greyed out in the "ALL TIME Audit" tab.
 *
 *   npx tsx scripts/archive-from-xlsx.ts            # dry run
 *   npx tsx scripts/archive-from-xlsx.ts --commit
 *
 * The spreadsheet encoded "no longer own this" as font colour rather than a
 * column: #999999 (42 rows) and #CCCCCC (1 row) against a #434343 / black
 * default. The dark-grey rows are recent additions, not disposals, so they are
 * deliberately excluded.
 *
 * `archivedOn` is left null — the sheet records that these are gone, not when.
 */
import ExcelJS from "exceljs";
import { eq, inArray, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { items } from "../src/db/schema";

const XLSX_PATH =
  process.env.XLSX_PATH ??
  "/Users/ashleychen/Desktop/side proj/outfit tracker/Outfit Tracker (Master).xlsx";

const ARCHIVED_COLOURS = new Set(["FF999999", "FFCCCCCC"]);
const COMMIT = process.argv.includes("--commit");

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet("ALL TIME Audit");
  if (!ws) throw new Error("missing sheet: ALL TIME Audit");

  const targets: { name: string; nameKey: string; colour: string }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const cell = row.getCell(1);
    const name = typeof cell.value === "string" ? cell.value.trim() : null;
    if (!name) return;

    const argb = cell.font?.color?.argb;
    if (argb && ARCHIVED_COLOURS.has(argb)) {
      targets.push({ name, nameKey: key(name), colour: argb });
    }
  });

  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  const keys = targets.map((t) => t.nameKey);
  const found = await db
    .select({ id: items.id, name: items.name, nameKey: items.nameKey, status: items.status })
    .from(items)
    .where(inArray(items.nameKey, keys));

  const foundKeys = new Set(found.map((f) => f.nameKey));
  const missing = targets.filter((t) => !foundKeys.has(t.nameKey));
  const already = found.filter((f) => f.status === "archived");

  console.log(`\nGreyed-out rows in sheet: ${targets.length}`);
  console.log(`  matched in database:    ${found.length}`);
  console.log(`  already archived:       ${already.length}`);
  if (missing.length) {
    console.log(`  NOT FOUND (skipped):    ${missing.length}`);
    for (const m of missing) console.log(`     ${m.name}`);
  }

  if (!COMMIT) {
    console.log("\nWould archive:");
    for (const f of found.filter((x) => x.status !== "archived")) {
      console.log(`   ${f.name}`);
    }
    console.log("\nDry run — nothing written. Re-run with --commit.\n");
    return;
  }

  const toArchive = found.filter((f) => f.status !== "archived").map((f) => f.id);
  if (toArchive.length) {
    await db
      .update(items)
      .set({ status: "archived", updatedAt: new Date() })
      .where(inArray(items.id, toArchive));
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.status, "archived"));

  console.log(`\nArchived ${toArchive.length} items. Total archived now: ${count}.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
