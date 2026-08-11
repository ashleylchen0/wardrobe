/**
 * Removes the flat studio background from product shots, leaving the garment on
 * transparency so every tile in the closet grid shares one background.
 *
 * These are e-commerce photos with a perfectly uniform backdrop, so this uses a
 * flood fill inward from the edges rather than a segmentation model: only
 * background connected to the border is cleared, which keeps same-coloured
 * regions *inside* the garment intact. It does not generalise to photos shot in
 * a room — those need a real matting model.
 *
 * Run: npx tsx scripts/knockout.ts [--out DIR]
 */

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { knockout, plain, type Holes } from "../src/lib/knockout";
import { lift } from "./lift";

const INBOX = "/Users/ashleychen/Desktop/wardrobe-photos/inbox";

type FileOptions = {
  /**
   * Resize only, no knockout. For photos where no colour gap exists to cut
   * against — a worn-on-model shot in a room, or a pale garment on a pale wall,
   * where a fill wide enough to clear the background also eats the garment.
   */
  plain?: true;
  /**
   * Cut the subject out with Vision instead of the flood fill — see `lift.ts`.
   * For photos shot in a room or outdoors, where there is no backdrop to sample
   * and the fill refuses the image outright. Also worth reaching for on a
   * packshot the fill tears, where matting beats any tolerance.
   */
  lift?: true;
  /**
   * Overrides the tolerance the knockout derives from its backdrop fit. Lower
   * it when a pale garment is being nibbled at; there is rarely a reason to
   * raise it, since the shadow pass already reaches beyond the fitted value.
   */
  tolerance?: number;
  /** See `Holes` — `keep` protects backdrop-coloured areas inside the garment. */
  holes?: Holes;
  /**
   * Margin to cut before the fill runs, as fractions of each edge.
   *
   * Several of these are screenshots off a retailer's site, so they carry
   * Pinterest badges, wishlist hearts, carousel arrows and thumbnail strips.
   * That furniture is not the backdrop colour, so the flood fill leaves it
   * behind and the trim then anchors to it — which is what pushed the tank into
   * a corner of an otherwise empty frame. Measured per image; a blanket margin
   * would clip the garments that sit close to the edge.
   */
  crop?: { top?: number; right?: number; bottom?: number; left?: number };
};

/** Per-image handling. Every entry here was set by looking at a preview. */
const OPTIONS: Record<string, FileOptions> = {
  "artizia black strappy tank.png": { crop: { top: 0.04 } },
  "artizia black zip up.png": { crop: { top: 0.05 } },
  "levis black jeans.png": {
    crop: { top: 0.06, right: 0.17, bottom: 0.055, left: 0.03 },
  },

  // A white tee on a white studio wall. The backdrop is retouched flat, so the
  // fitted tolerance is already tight, but the lit side of the tee is closer
  // still and needs the fill held right down.
  "uniqlo white baby tee.png": { tolerance: 3 },

  // Worn on a model against a near-white studio wall, which gives the fill
  // nothing to stop at: the skort, the model's cream sweater and the backdrop
  // all sit within a few values of each other. Matting reads the silhouette
  // instead of the colour, so it cuts what the fill could only be resized past.
  "white workout skort.png": { lift: true },

  // Shot in a room — wooden side table, floor, wall. The corners disagree by 48
  // levels, so there is no backdrop colour to sample in the first place.
  "little puffy hoodie.jpg": { lift: true },

  // The print sits in a white box on a cream tee. Clearing unreachable pockets
  // punches that box straight through and leaves the artwork floating on a
  // tile-coloured hole, so restrict removal to background touching the border.
  "peter pan tee.png": { holes: "keep" },

  // Tan shoe on white, with a soft drop shadow that the default tolerance
  // leaves as a grey smear under the sole. There is a wide colour gap between
  // the leather and the backdrop, so a much higher threshold takes the shadow
  // without touching the shoe.
  "nordstrom nude kitten heels.png": { tolerance: 90 },

  // Same story: the shadow under the sleeves needs a wide threshold, and the
  // olive nylon is nowhere near white. The care label at the collar is white
  // and gets punched through, which is invisible against the tile.
  "rei green quilted puffer.png": { tolerance: 90 },

  // Cream knit on a white model shot. The default tolerance shreds the sweater;
  // 20 stops at the knit, and keeping holes protects the pale areas of the
  // pattern that the border fill cannot reach anyway.
  "weekday white black knit sweater.png": { tolerance: 20, holes: "keep" },

  // Mirror selfie: wicker screen, wood floor, and the dress worn. The border is
  // 37 levels off a smooth surface, so the fill refuses it outright.
  "birdy grey beige satin slip dress.png": { lift: true },

  // Worn on the street over asphalt — no backdrop at all.
  "tonya light wash straight jeans.png": { lift: true },

  // Bag photographed outdoors on paving stones, with a hedge behind it.
  "lattice black adjustable bag.JPG": { lift: true },

  // A packshot, and the fill does find the backdrop — but the gap between the
  // model's arm and her hip lets it through into the skirt, and pale satin on
  // white gives it nothing to stop at once it is inside. Holding the tolerance
  // down to 9 keeps the silhouette whole but leaves a smear of backdrop in that
  // gap; matting gets both.
  "billy j yellow midi dress slit.png": { lift: true },
};

const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

async function applyCrop(input: Buffer, file: string): Promise<Buffer> {
  const crop = OPTIONS[file]?.crop;
  if (!crop) return input;

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

/** Crop the screenshot furniture, then knock out the backdrop, for one inbox file. */
export async function prepare(file: string): Promise<Buffer> {
  const options = OPTIONS[file] ?? {};
  const cropped = await applyCrop(
    await sharp(join(INBOX, file)).toBuffer(),
    file,
  );

  if (options.lift) {
    return lift(cropped);
  }

  if (options.plain) {
    return plain(cropped);
  }

  const { buffer, cleared } = await knockout(cropped, {
    tolerance: options.tolerance,
    holes: options.holes,
  });
  process.stdout.write(`  cleared ${(cleared * 100).toFixed(0)}% of pixels`);
  return buffer;
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const OUT =
    outIndex === -1
      ? "/Users/ashleychen/Desktop/wardrobe-photos/knockout"
      : process.argv[outIndex + 1];
  await mkdir(OUT, { recursive: true });

  const files = (await readdir(INBOX)).filter((f) =>
    SUPPORTED.has(extname(f).toLowerCase()),
  );

  for (const file of files) {
    console.log(file);
    try {
      const output = await prepare(file);
      const target = join(OUT, `${basename(file, extname(file))}.webp`);
      await writeFile(target, output);
      const meta = await sharp(output).metadata();
      console.log(` -> ${meta.width}x${meta.height} ${(output.length / 1024).toFixed(0)}KB`);
    } catch (error) {
      console.log(`  FAILED: ${(error as Error).message}`);
    }
  }
  console.log(`\nOutput: ${OUT}`);
}

// Only when run directly — `attach-photos.ts` imports `prepare` from here, and
// an unguarded call would reprocess the whole inbox as an import side effect.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main();
}
