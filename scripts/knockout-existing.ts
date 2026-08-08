/**
 * Knocks the backdrop out of photos already in the Blob store — the ones pulled
 * from retailer sites rather than dropped in the inbox.
 *
 * Nothing needs to live on disk: private blobs are read back through
 * `get(pathname, { access: "private" })`, the same call the /api/photo route
 * uses, processed in memory, and written back as a new blob.
 *
 * Previews by default; pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/knockout-existing.ts --category accessories
 *   npx tsx --env-file=.env.local scripts/knockout-existing.ts --category accessories --apply
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { del, get, put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import sharp from "sharp";
import { knockout, plain } from "../src/lib/knockout";

const sql = neon(process.env.DATABASE_URL!);

const apply = process.argv.includes("--apply");
const categoryIndex = process.argv.indexOf("--category");
const category = categoryIndex === -1 ? null : process.argv[categoryIndex + 1];
const previewIndex = process.argv.indexOf("--preview-dir");
const PREVIEW =
  previewIndex === -1 ? "/tmp/knockout-preview" : process.argv[previewIndex + 1];

/** The tile the closet grid paints behind photos, for honest previews. */
const TILE = "#f1efeb";

type ItemOptions = {
  /** Resize only. For photos where no colour gap exists to knock out against. */
  plain?: true;
  tolerance?: number;
  maxSpread?: number;
  crop?: { top?: number; right?: number; bottom?: number; left?: number };
};

/**
 * Per-item handling, keyed by item name. Everything here was set by looking at
 * a preview, not guessed.
 */
const ITEM_OPTIONS: Record<string, ItemOptions> = {
  // Worn on a model against a near-white wall: shirt, skin and backdrop all sit
  // within a few levels, so any tolerance wide enough to clear the wall also
  // eats the shirt. Resize only.
  "white tee m": { plain: true },

  // Carries a JW Anderson x UNIQLO lockup in the top-left. It survives the fill
  // and then anchors the trim, leaving the jeans small and off-centre.
  "jwa jeans": { crop: { top: 0.09 } },

  // Model shot where the lit side of the skin sits within a few levels of the
  // backdrop. A tolerance tight enough to spare her arm leaves grey patches
  // stranded mid-frame; one wide enough to clear them tears holes in her face.
  // No threshold separates the two, so this one is resize-only.
  "Black one shoulder top": { plain: true },

  // Gentle studio vignettes — the corners drift a little but the backdrop is
  // still flat enough to fill against. These also need a wider tolerance than
  // the default: the vignette drifts far enough from the sampled corner that a
  // tight threshold strands patches of grey mid-frame. All are dark subjects on
  // pale backdrops, so there is headroom before the fill could reach them.
  "black shorts OV": { maxSpread: 20, tolerance: 60 },
  "Doc Martens": { maxSpread: 20, tolerance: 60 },
  "brown mary janes": { maxSpread: 20, tolerance: 60 },
};

async function applyCrop(input: Buffer, crop: NonNullable<ItemOptions["crop"]>) {
  const image = sharp(input);
  const { width, height } = await image.metadata();
  const left = Math.round(width! * (crop.left ?? 0));
  const top = Math.round(height! * (crop.top ?? 0));
  return image
    .extract({
      left,
      top,
      width: width! - left - Math.round(width! * (crop.right ?? 0)),
      height: height! - top - Math.round(height! * (crop.bottom ?? 0)),
    })
    .png()
    .toBuffer();
}

/**
 * True when the image already carries real transparency. `hasAlpha` alone is
 * not enough — plenty of PNGs ship a fully opaque alpha channel — so this reads
 * the minimum alpha value rather than trusting the header.
 */
async function alreadyCutOut(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return false;
  const stats = await sharp(input).stats();
  const alpha = stats.channels[stats.channels.length - 1];
  return alpha.min < 250;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "item"
  );
}

async function main() {
  if (!apply) await mkdir(PREVIEW, { recursive: true });

  // Everything this script writes lands as .webp, so that extension is a
  // reliable marker of "already processed" and makes reruns cheap.
  const remaining = process.argv.includes("--remaining");

  const rows = category
    ? await sql`
        select id, name, image_path from items
        where image_path is not null and category = ${category}
        order by name`
    : remaining
      ? await sql`
          select id, name, image_path from items
          where image_path is not null and image_path not like '%.webp'
          order by category, name`
      : await sql`
          select id, name, image_path from items
          where image_path is not null order by name`;

  console.log(
    `${rows.length} item(s)${category ? ` in ${category}` : ""} — ${apply ? "APPLYING" : "preview only"}\n`,
  );

  let done = 0;
  let skipped = 0;

  for (const row of rows) {
    const pathname = row.image_path as string;
    process.stdout.write(`${(row.name as string).padEnd(30)} `);

    try {
      const source = await get(pathname, { access: "private" });
      if (!source) {
        console.log("SKIP — blob missing");
        skipped += 1;
        continue;
      }

      const raw = Buffer.from(await new Response(source.stream).arrayBuffer());

      // Refuse to knock out something already knocked out. The corners of a
      // finished cutout are transparent, so the uniformity check reads garbage
      // — sometimes rejecting it, but sometimes sampling whatever RGB sits
      // under the zeroed alpha and eating the subject. `--remaining` avoids
      // these entirely; `--category` can reach them, so check here too.
      if (await alreadyCutOut(raw)) {
        console.log("SKIP — already has a transparent background");
        skipped += 1;
        continue;
      }

      const options = ITEM_OPTIONS[row.name as string] ?? {};
      const input = options.crop ? await applyCrop(raw, options.crop) : raw;

      let output: Buffer;
      if (options.plain) {
        output = await plain(input);
      } else {
        const result = await knockout(input, {
          tolerance: options.tolerance,
          maxSpread: options.maxSpread,
        });
        output = result.buffer;
        process.stdout.write(`cleared ${(result.cleared * 100).toFixed(0)}% `);
      }

      if (!apply) {
        // Flatten onto the tile so the preview shows what the grid will show;
        // a bare alpha channel looks fine against anything and hides bleed.
        const meta = await sharp(output).metadata();
        const flat = await sharp({
          create: {
            width: meta.width!,
            height: meta.height!,
            channels: 3,
            background: TILE,
          },
        })
          .composite([{ input: output }])
          .png()
          .toBuffer();
        await writeFile(join(PREVIEW, `${slugify(row.name as string)}.png`), flat);
        console.log(`preview ${meta.width}x${meta.height}`);
        done += 1;
        continue;
      }

      const blob = await put(`items/${slugify(row.name as string)}.webp`, output, {
        access: "private",
        addRandomSuffix: true,
        contentType: "image/webp",
      });
      await sql`
        update items set image_path = ${blob.pathname}, updated_at = now()
        where id = ${row.id}`;
      if (pathname !== blob.pathname) await del(pathname).catch(() => {});

      console.log(`-> ${(output.length / 1024).toFixed(0)}KB`);
      done += 1;
    } catch (error) {
      console.log(`SKIP — ${(error as Error).message}`);
      skipped += 1;
    }
  }

  console.log(`\n${done} processed, ${skipped} skipped`);
  if (!apply) console.log(`Previews: ${PREVIEW}`);
}

main();
