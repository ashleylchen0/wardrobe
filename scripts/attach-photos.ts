/**
 * Attaches prepped photos to items: resize -> upload to Blob -> set image_path.
 *
 * Produces exactly what the in-app uploader produces (1200px max edge, webp
 * q82, private access), so a bulk-attached photo is indistinguishable from a
 * hand-uploaded one.
 *
 * Run: npx tsx --env-file=.env.local scripts/attach-photos.ts [--dry-run]
 */

import { del, put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import { prepare } from "./knockout";

type Job = {
  file: string;
  /** Item names exactly as stored; one photo may serve several items. */
  items: string[];
};

const JOBS: Job[] = [
  { file: "aritzia black wide cargos.png.png", items: ["black wide cargos"] },
  { file: "artizia black strappy tank.png", items: ["black strappy tank aritzia"] },
  { file: "artizia black zip up.png", items: ["black zip up"] },
  {
    file: "uniqlo white baby tee.png",
    items: ["white baby tee", "white baby tee 2"],
  },
  { file: "eras tour crewneck.png", items: ["Eras tour crewneck"] },
  { file: "white workout skort.png", items: ["white workout skort"] },
  // Replaces a 1200x630 web-pulled banner crop with the full product shot.
  { file: "levis black jeans.png", items: ["levis black jeans"] },
  { file: "levis dad jeans blue.png", items: ["levis dad jeans blue"] },
  { file: "black stussy honolulu.png", items: ["black stussy honolulu"] },
];

const dryRun = process.argv.includes("--dry-run");
const sql = neon(process.env.DATABASE_URL!);

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "item"
  );
}

/**
 * Cropping, background removal and the final resize all live in `knockout.ts`
 * so the grid can't drift out of step with what gets uploaded.
 */
async function render(job: Job) {
  return prepare(job.file);
}

async function main() {
  console.log(dryRun ? "DRY RUN — nothing will be written\n" : "");

  for (const job of JOBS) {
    console.log(`${job.file}`);

    const rows = await sql`
      select id, name, image_path from items where name = any(${job.items})`;

    const missing = job.items.filter((n) => !rows.some((r) => r.name === n));
    if (missing.length) {
      console.log(`  SKIP — no item named: ${missing.join(", ")}\n`);
      continue;
    }

    const buffer = await render(job);
    console.log(`  rendered ${(buffer.length / 1024).toFixed(0)}KB webp`);

    for (const row of rows) {
      if (dryRun) {
        console.log(`  would attach -> ${row.name}`);
        continue;
      }

      // Each item gets its own blob, so removing a photo from one item never
      // blanks another that happens to share the same source image.
      const blob = await put(`items/${slugify(row.name)}.webp`, buffer, {
        access: "private",
        addRandomSuffix: true,
        contentType: "image/webp",
      });

      const previous = row.image_path as string | null;
      await sql`
        update items set image_path = ${blob.pathname}, updated_at = now()
        where id = ${row.id}`;

      if (previous && previous !== blob.pathname) {
        await del(previous).catch(() => {});
      }

      console.log(`  attached -> ${row.name}  (${blob.pathname})`);
    }
    console.log("");
  }
}

main();
