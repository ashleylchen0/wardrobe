/**
 * Knocks the backdrop out of photos already in the Blob store — the ones pulled
 * from retailer sites rather than dropped in the inbox.
 *
 * Nothing needs to live on disk: private blobs are read back through
 * `get(pathname, { access: "private" })`, the same call the /api/photo route
 * uses, processed in memory, and written back as a new blob.
 *
 * Previews by default; pass --apply to write. With no selector it walks the
 * whole library and skips anything already cut out, which is the way to find
 * photos that still carry a backdrop; --only narrows a rerun to one item.
 *
 *   npx tsx --env-file=.env.local scripts/knockout-existing.ts --category accessories
 *   npx tsx --env-file=.env.local scripts/knockout-existing.ts --only "gray baby tee" --apply
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { del, get, put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import sharp from "sharp";
import { knockout, plain, type Holes } from "../src/lib/knockout";
import { auditPhoto } from "./audit-backgrounds";
import { lift } from "./lift";

const sql = neon(process.env.DATABASE_URL!);

const apply = process.argv.includes("--apply");
const categoryIndex = process.argv.indexOf("--category");
const category = categoryIndex === -1 ? null : process.argv[categoryIndex + 1];
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1].toLowerCase();
const previewIndex = process.argv.indexOf("--preview-dir");
const PREVIEW =
  previewIndex === -1 ? "/tmp/knockout-preview" : process.argv[previewIndex + 1];

/**
 * A fill this wide has eaten the subject rather than the backdrop — the whole
 * frame came back transparent. `normalizePhoto` refuses at the same threshold;
 * this script writes straight to the blob store, so it has to refuse too.
 */
const RUNAWAY = 0.985;

/** The tile the closet grid paints behind photos, for honest previews. */
const TILE = "#f1efeb";

/** Nothing in a garment photo is this colour, so cleared pixels are unmistakable. */
const CHECK = "#ff00ff";

const GUTTER = 16;

type ItemOptions = {
  /** Resize only. For photos where no colour gap exists to knock out against. */
  plain?: true;
  /**
   * Cut the subject out with Vision rather than the flood fill — see `lift.ts`.
   * This is what the entries below that used to be `plain` now use: the fill
   * needs a backdrop to sample and a colour gap to stop at, and a photo shot in
   * a room offers neither, but matting only needs the silhouette.
   */
  lift?: true;
  /** Overrides the tolerance the knockout derives from the backdrop fit. */
  tolerance?: number;
  /** See `Holes` — `clear` also removes backdrop trapped inside the subject. */
  holes?: Holes;
  crop?: { top?: number; right?: number; bottom?: number; left?: number };
};

/**
 * UNIQLO's model shots stamp the model's height and the size worn into the
 * bottom-right corner. It is not the backdrop colour, so the fill leaves it and
 * the trim then anchors to it, framing the garment around a line of text.
 */
const UNIQLO_SIZE_STAMP = { bottom: 0.1 };

/**
 * Per-item handling, keyed by item name. Everything here was set by looking at
 * a preview, not guessed.
 */
const ITEM_OPTIONS: Record<string, ItemOptions> = {
  // Carries a JW Anderson x UNIQLO lockup in the top-left. It survives the fill
  // and then anchors the trim, leaving the jeans small and off-centre.
  "jwa jeans": { crop: { top: 0.09 } },

  // UNIQLO model shots, which stamp the model's height into the corner.
  "Black heattech thick": { crop: UNIQLO_SIZE_STAMP },
  "Black puffer vest": { crop: UNIQLO_SIZE_STAMP },
  "gray baby tee": { crop: UNIQLO_SIZE_STAMP },
  "wide leg beige sweats": { crop: UNIQLO_SIZE_STAMP },
  "brown linen pants": { crop: UNIQLO_SIZE_STAMP },

  // A dark garment, so there is no risk in also clearing the backdrop trapped
  // between the model's arm and her body.
  "Black one shoulder top": { holes: "clear" },

  // The backdrop here is a retouched constant and the cuff is barely off it, so
  // even the derived tolerance takes a bite out of the sleeve. Three levels is
  // enough to lift a mathematically flat backdrop.
  "white waffle long sleeve": { tolerance: 3 },

  // Everything below defeats the fill for one reason or another, so it is matted
  // instead. Each kept its backdrop until the lift path existed.
  //
  // A macro crop of the collar, where the fabric *is* the border: the backdrop
  // fit lands on the shirt itself and the fill then clears it.
  "white ribbed long sleeve": { lift: true },

  // Worn on a model against a near-white wall, with the blown-out tee touching
  // the frame edge — the fill walks in through the shoulders and shreds it.
  "white tee m": { lift: true },

  // An upscaled screenshot: the backdrop carries compression noise in every
  // direction, so a tolerance tight enough to spare the cream sweatshirt leaves
  // the backdrop speckled and a wider one eats the sweatshirt.
  "white workout skort": { lift: true },

  // The fill does cut this one, but the model's lit shoulder is blown out to
  // the backdrop's own value and comes away with it, leaving a notch in the
  // sleeve. Matting keeps the shoulder.
  "blue workout long sleeve": { lift: true },

  // Shot in a room rather than against a backdrop — a bean bag, a side table, a
  // wall with a floor line in it. The knockout refuses these on its own; the
  // entries are here so the reason is written down rather than rediscovered.
  //
  // Vision lifts every foreground instance, not just the garment, so the black
  // cushion and the tote beside the model in the sweatpants shot come along.
  // They read as props on the tile rather than as a room, which is the point.
  "mauve sweatpants": { lift: true },
  "brown button down": { lift: true },
  "green griffith observatory crewneck": { lift: true },
  "LP hoodie": { lift: true },
  "tan trench coat": { lift: true },
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
 * not enough — plenty of PNGs ship a fully opaque alpha channel, and a photo
 * where the fill only lifted a margin before the trim cropped that margin away
 * carries real transparency at its feathered edge while keeping every bit of
 * its backdrop. So this asks the same question the audit does: is the border of
 * this image actually see-through?
 */
async function alreadyCutOut(pathname: string): Promise<boolean> {
  const audit = await auditPhoto(pathname);
  return !!audit && audit.ringTransparent >= 0.25;
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

  const selected = category
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

  const rows = only
    ? selected.filter((row) =>
        (row.name as string).toLowerCase().includes(only),
      )
    : selected;

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

      // Refuse to knock out something already knocked out. The border of a
      // finished cutout is transparent, so the backdrop fit reads whatever RGB
      // sits under the zeroed alpha and the fill can eat the subject.
      if (await alreadyCutOut(pathname)) {
        console.log("SKIP — already has a transparent background");
        skipped += 1;
        continue;
      }

      const options = ITEM_OPTIONS[row.name as string] ?? {};
      const input = options.crop ? await applyCrop(raw, options.crop) : raw;

      let output: Buffer;
      if (options.lift) {
        output = await lift(input);
      } else if (options.plain) {
        output = await plain(input);
      } else {
        const result = await knockout(input, {
          tolerance: options.tolerance,
          holes: options.holes,
        });
        if (result.cleared > RUNAWAY) {
          console.log(
            `SKIP — fill cleared ${(result.cleared * 100).toFixed(0)}%, the subject went with it`,
          );
          skipped += 1;
          continue;
        }
        output = result.buffer;
        process.stdout.write(`cleared ${(result.cleared * 100).toFixed(0)}% `);
      }

      if (!apply) {
        // Two panels side by side, and both are needed.
        //
        // The tile shows what the closet will show. On its own it is a trap: a
        // backdrop that survived reads as a pale field, and so does a cleanly
        // cleared one, so a photo that was never cut at all looks finished.
        // Against magenta, only the pixels that are really gone go magenta.
        const meta = await sharp(output).metadata();
        const panel = (background: string) =>
          sharp({
            create: {
              width: meta.width!,
              height: meta.height!,
              channels: 3,
              background,
            },
          })
            .composite([{ input: output }])
            .png()
            .toBuffer();

        const pair = await sharp({
          create: {
            width: meta.width! * 2 + GUTTER,
            height: meta.height!,
            channels: 3,
            background: "#000000",
          },
        })
          .composite([
            { input: await panel(TILE), left: 0, top: 0 },
            { input: await panel(CHECK), left: meta.width! + GUTTER, top: 0 },
          ])
          .png()
          .toBuffer();

        await writeFile(join(PREVIEW, `${slugify(row.name as string)}.png`), pair);
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
