/**
 * One-off migration from "Outfit Tracker (Master).xlsx" into Postgres.
 *
 *   npx tsx scripts/import.ts            # dry run — parses, reports, writes nothing
 *   npx tsx scripts/import.ts --commit   # actually inserts
 *
 * The workbook holds the same catalog four times over (one "Audit" sheet per
 * year plus ALL TIME) and the same outfit log twice (year tabs plus ALL TIME),
 * and the copies disagree. Precedence rules below are derived from what the
 * disagreements actually look like — see README notes in each section.
 */
import ExcelJS from "exceljs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { items, itemAliases, wears } from "../src/db/schema";
import { refineBottoms } from "../src/lib/categorize";

const XLSX_PATH =
  process.env.XLSX_PATH ??
  "/Users/ashleychen/Desktop/side proj/outfit tracker/Outfit Tracker (Master).xlsx";

const COMMIT = process.argv.includes("--commit");

/** Newest first. Later sheets only fill gaps the earlier ones left. */
const AUDIT_SHEETS = [
  "2026 Audit",
  "2025 Audit",
  "2024 Audit",
  "ALL TIME Audit",
] as const;

const LOG_YEAR_SHEETS = ["2024", "2025", "2026"] as const;

type Category = (typeof schema.category.enumValues)[number];

const CATEGORY_MAP: Record<string, Category> = {
  tops: "tops",
  sweater: "sweaters",
  sweaters: "sweaters",
  bottoms: "bottoms",
  pants: "bottoms",
  jeans: "jeans",
  dresses: "dresses",
  outerwear: "outerwear",
  shoes: "shoes",
  accessories: "accessories",
};

/** "Workout" described use, not garment, so it becomes a tag and we infer the type. */
function inferWorkoutCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/short|skort|legging|pant|tight|sweat/.test(n)) return "bottoms";
  if (/shoe|sneaker|trainer|running/.test(n)) return "shoes";
  return "tops";
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const cell = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  // ExcelJS gives formula cells as { formula, result }.
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result: unknown }).result;
    return r === null || r === undefined ? null : String(r).trim() || null;
  }
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  return s === "" || s === "--" ? null : s;
};

function parseCostCents(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(String(raw).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** 162 real dates, 36 bare years like 2021, 29 blank or "--". */
function parseAcquired(raw: unknown): {
  acquiredOn: string | null;
  acquiredPrecision: "day" | "year" | "unknown";
} {
  if (raw instanceof Date) {
    return { acquiredOn: raw.toISOString().slice(0, 10), acquiredPrecision: "day" };
  }
  const s = cell(raw);
  if (s === null) return { acquiredOn: null, acquiredPrecision: "unknown" };
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum >= 1990 && asNum <= 2100) {
    return { acquiredOn: `${Math.trunc(asNum)}-01-01`, acquiredPrecision: "year" };
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return { acquiredOn: d.toISOString().slice(0, 10), acquiredPrecision: "day" };
  }
  return { acquiredOn: null, acquiredPrecision: "unknown" };
}

const toDateOnly = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
};

type Draft = {
  name: string;
  nameKey: string;
  brand: string | null;
  category: Category;
  tags: string[];
  costCents: number | null;
  acquiredOn: string | null;
  acquiredPrecision: "day" | "year" | "unknown";
  notes: string | null;
  needsReview: boolean;
  importConflicts: Record<string, { source: string; value: unknown }[]> | null;
  /**
   * Reporting only, not persisted. Taken from ALL TIME Audit specifically —
   * that sheet counts 2023-2026, while each year tab counts only its own year,
   * so comparing against a year tab would measure nothing.
   */
  statedTimesWorn: number | null;
};

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  // ---------------------------------------------------------------- catalog
  const drafts = new Map<string, Draft>();
  const costSeen = new Map<string, { source: string; value: number }[]>();
  const catSeen = new Map<string, { source: string; value: string }[]>();

  for (const sheetName of AUDIT_SHEETS) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`missing sheet: ${sheetName}`);

    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return; // header
      const name = cell(row.getCell(1).value);
      if (!name || key(name) === "item description") return;

      const k = key(name);
      const brand = cell(row.getCell(2).value);
      const rawCat = cell(row.getCell(3).value);
      const costCents = parseCostCents(cell(row.getCell(4).value));
      const acquired = parseAcquired(row.getCell(5).value);
      const statedWorn = Number(cell(row.getCell(6).value) ?? NaN);
      const notes = cell(row.getCell(8).value);

      if (costCents !== null) {
        const list = costSeen.get(k) ?? [];
        list.push({ source: sheetName, value: costCents });
        costSeen.set(k, list);
      }
      if (rawCat) {
        const list = catSeen.get(k) ?? [];
        list.push({ source: sheetName, value: rawCat });
        catSeen.set(k, list);
      }

      const existing = drafts.get(k);
      if (!existing) {
        const lowered = rawCat?.toLowerCase() ?? "";
        const isWorkout = lowered === "workout";
        const mapped = isWorkout
          ? inferWorkoutCategory(name)
          : (CATEGORY_MAP[lowered] ?? "tops");
        drafts.set(k, {
          name: name.trim(),
          nameKey: k,
          brand,
          // The sheets used Jeans/Bottoms/Pants inconsistently; name decides.
          category: refineBottoms(name, mapped),
          tags: isWorkout ? ["workout"] : [],
          costCents,
          acquiredOn: acquired.acquiredOn,
          acquiredPrecision: acquired.acquiredPrecision,
          notes,
          needsReview: false,
          importConflicts: null,
          statedTimesWorn:
            sheetName === "ALL TIME Audit" && Number.isFinite(statedWorn)
              ? statedWorn
              : null,
        });
      } else {
        // Older sheet: fill only what the newer one left blank.
        existing.brand ??= brand;
        existing.costCents ??= costCents;
        existing.notes ??= notes;
        if (existing.acquiredPrecision === "unknown" && acquired.acquiredOn) {
          existing.acquiredOn = acquired.acquiredOn;
          existing.acquiredPrecision = acquired.acquiredPrecision;
        }
        if (sheetName === "ALL TIME Audit" && Number.isFinite(statedWorn)) {
          existing.statedTimesWorn = statedWorn;
        }
      }
    });
  }

  // Flag disagreements rather than silently trusting the newest sheet.
  let costConflicts = 0;
  let catConflicts = 0;
  for (const [k, draft] of drafts) {
    const conflicts: Record<string, { source: string; value: unknown }[]> = {};

    const costs = costSeen.get(k) ?? [];
    if (new Set(costs.map((c) => c.value)).size > 1) {
      conflicts.costCents = costs;
      costConflicts++;
    }
    const cats = catSeen.get(k) ?? [];
    if (new Set(cats.map((c) => c.value.toLowerCase())).size > 1) {
      conflicts.category = cats;
      catConflicts++;
    }
    if (Object.keys(conflicts).length > 0) {
      draft.needsReview = true;
      draft.importConflicts = conflicts;
    }
  }

  // ------------------------------------------------------------------ wears
  // Year tabs are canonical for 2024-2026; ALL TIME stopped receiving entries
  // around 2026-06-23 but is the only source for 2023.
  type WearRow = { nameKey: string; wornOn: string; slot: string | null };
  const wearRows = new Map<string, WearRow>();
  const unknownNames = new Map<string, number>();

  const readLog = (sheetName: string, yearFilter?: (y: number) => boolean) => {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`missing sheet: ${sheetName}`);
    const header = ws.getRow(1);
    let added = 0;

    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const wornOn = toDateOnly(row.getCell(1).value);
      if (!wornOn) return; // stray "2024"/"2025" marker rows
      if (yearFilter && !yearFilter(Number(wornOn.slice(0, 4)))) return;

      for (let c = 2; c <= 9; c++) {
        const raw = cell(row.getCell(c).value);
        if (!raw) continue;
        const k = key(raw);
        if (k === "item description") continue;
        const slot = cell(header.getCell(c).value);
        const dedupe = `${k}|${wornOn}`;
        if (!wearRows.has(dedupe)) {
          wearRows.set(dedupe, { nameKey: k, wornOn, slot });
          added++;
        }
      }
    });
    return added;
  };

  const perSheet: Record<string, number> = {};
  for (const s of LOG_YEAR_SHEETS) perSheet[s] = readLog(s);
  perSheet["ALL TIME (2023 only)"] = readLog("ALL TIME", (y) => y === 2023);
  // Anything the year tabs never received (ALL TIME's post-June-2026 gap is the
  // reverse case, but 2024-25 edits can go either way).
  perSheet["ALL TIME (fills gaps)"] = readLog("ALL TIME");

  for (const { nameKey } of wearRows.values()) {
    if (!drafts.has(nameKey)) {
      unknownNames.set(nameKey, (unknownNames.get(nameKey) ?? 0) + 1);
    }
  }

  /**
   * Three names appear in the logs but in no catalog sheet. Ashley confirmed
   * each is its own garment — in particular "pleated skirt" is NOT the same as
   * "plaid pleated skirt" — so they get seeded rather than merged or dropped.
   */
  const STUB_HINTS: Record<
    string,
    { brand?: string; category: Category; tags?: string[] }
  > = {
    "pleated skirt": { category: "bottoms" },
    "white waffle long sleeve": { brand: "Uniqlo", category: "tops" },
    "green ov leggings": {
      brand: "Outdoor Voices",
      category: "bottoms",
      tags: ["workout"],
    },
  };

  for (const [k, count] of unknownNames) {
    const hint = STUB_HINTS[k];
    drafts.set(k, {
      name: k,
      nameKey: k,
      brand: hint?.brand ?? null,
      category: hint?.category ?? "tops",
      tags: hint?.tags ?? [],
      costCents: null,
      acquiredOn: null,
      acquiredPrecision: "unknown",
      notes: `Worn ${count}x but absent from every catalog sheet — cost still unknown.`,
      needsReview: true,
      importConflicts: null,
      statedTimesWorn: null,
    });
  }

  // ----------------------------------------------------------------- report
  const counted = new Map<string, number>();
  for (const { nameKey } of wearRows.values()) {
    counted.set(nameKey, (counted.get(nameKey) ?? 0) + 1);
  }

  const byCategory = new Map<string, number>();
  for (const d of drafts.values()) {
    byCategory.set(d.category, (byCategory.get(d.category) ?? 0) + 1);
  }

  console.log(`\n${"=".repeat(64)}\n  IMPORT ${COMMIT ? "(COMMITTING)" : "— DRY RUN, nothing written"}\n${"=".repeat(64)}`);
  console.log(`\nItems:  ${drafts.size}`);
  for (const [c, n] of [...byCategory].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${c.padEnd(13)} ${n}`);
  }
  console.log(`\nWear events: ${wearRows.size}`);
  for (const [s, n] of Object.entries(perSheet)) {
    console.log(`   ${s.padEnd(22)} +${n}`);
  }
  const days = new Set([...wearRows.values()].map((w) => w.wornOn));
  const sorted = [...days].sort();
  console.log(`   distinct days: ${days.size}  (${sorted[0]} → ${sorted.at(-1)})`);

  console.log(`\nFlagged for review: ${[...drafts.values()].filter((d) => d.needsReview).length}`);
  console.log(`   cost disagreements     ${costConflicts}`);
  console.log(`   category disagreements ${catConflicts}`);
  console.log(`   log-only stub items    ${unknownNames.size}`);
  for (const [k, c] of unknownNames) console.log(`      "${k}" (worn ${c}x)`);

  const drift = [...drafts.values()]
    .filter((d) => d.statedTimesWorn !== null)
    .map((d) => ({
      name: d.name,
      stated: d.statedTimesWorn!,
      counted: counted.get(d.nameKey) ?? 0,
    }))
    .filter((d) => d.stated !== d.counted)
    .sort((a, b) => Math.abs(b.stated - b.counted) - Math.abs(a.stated - a.counted));

  const compared = [...drafts.values()].filter((d) => d.statedTimesWorn !== null).length;
  console.log(
    `\nTimes-worn vs ALL TIME Audit: ${drift.length} of ${compared} items differ`,
  );
  for (const d of drift.slice(0, 15)) {
    const delta = d.counted - d.stated;
    console.log(`   ${String(delta > 0 ? "+" + delta : delta).padStart(5)}  ${d.name} — sheet said ${d.stated}, logs show ${d.counted}`);
  }
  if (drift.length > 15) console.log(`   … and ${drift.length - 15} more`);

  const never = [...drafts.values()].filter((d) => !counted.has(d.nameKey));
  console.log(`\nNever worn: ${never.length} items`);
  for (const d of never.slice(0, 12)) console.log(`   ${d.name}`);

  if (!COMMIT) {
    console.log(`\nDry run complete — database untouched. Re-run with --commit to write.\n`);
    return;
  }

  // ----------------------------------------------------------------- insert
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

  const rows = [...drafts.values()].map(({ statedTimesWorn: _s, ...r }) => r);
  const inserted: { id: string; nameKey: string }[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    inserted.push(
      ...(await db
        .insert(items)
        .values(chunk)
        .onConflictDoNothing()
        .returning({ id: items.id, nameKey: items.nameKey })),
    );
  }
  const idByKey = new Map(inserted.map((r) => [r.nameKey, r.id]));

  const wearValues = [...wearRows.values()]
    .map((w) => ({
      itemId: idByKey.get(w.nameKey)!,
      wornOn: w.wornOn,
      slot: w.slot,
      source: "import" as const,
    }))
    .filter((w) => w.itemId);

  let wearCount = 0;
  for (let i = 0; i < wearValues.length; i += 500) {
    const chunk = wearValues.slice(i, i + 500);
    const res = await db.insert(wears).values(chunk).onConflictDoNothing().returning({ id: wears.id });
    wearCount += res.length;
  }

  console.log(`\nInserted ${inserted.length} items and ${wearCount} wear events.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
