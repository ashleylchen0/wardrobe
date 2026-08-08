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
import { knockout, plain } from "../src/lib/knockout";

const INBOX = "/Users/ashleychen/Desktop/wardrobe-photos/inbox";

/**
 * Per-image overrides. A pale garment on a pale backdrop leaves almost no gap
 * for the fill to stop in — the white tee sits at ~250 on a 212 backdrop, which
 * the default tolerance spans, so the fill walks straight into the shirt and
 * tears holes in it. Tighten until the garment survives.
 */
const TOLERANCES: Record<string, number> = {
  "uniqlo white baby tee.png": 12,
};

const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

/**
 * Margins to cut before the fill runs, as fractions of each edge.
 *
 * Several of these are screenshots off a retailer's site, so they carry
 * Pinterest badges, wishlist hearts, carousel arrows and thumbnail strips. That
 * furniture is not the backdrop colour, so the flood fill leaves it behind and
 * the trim then anchors to it — which is what pushed the tank into a corner of
 * an otherwise empty frame. Measured per image; a blanket margin would clip the
 * garments that sit close to the edge.
 */
const CROPS: Record<string, { top?: number; right?: number; bottom?: number; left?: number }> = {
  "artizia black strappy tank.png": { top: 0.04 },
  "artizia black zip up.png": { top: 0.05 },
  "levis black jeans.png": { top: 0.06, right: 0.17, bottom: 0.055, left: 0.03 },
};

async function applyCrop(input: Buffer, file: string): Promise<Buffer> {
  const crop = CROPS[file];
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

/**
 * Files to resize without knocking anything out. A worn-on-model shot against a
 * near-white studio wall gives the fill nothing to stop at — the skort, the
 * model's cream sweater and the backdrop all sit within a few values of each
 * other — so a knockout eats the garment instead of the background.
 */
const PLAIN = new Set(["white workout skort.png"]);

/** Crop the screenshot furniture, then knock out the backdrop, for one inbox file. */
export async function prepare(file: string): Promise<Buffer> {
  const cropped = await applyCrop(
    await sharp(join(INBOX, file)).toBuffer(),
    file,
  );

  if (PLAIN.has(file)) {
    return plain(cropped);
  }

  const { buffer, cleared } = await knockout(cropped, {
    tolerance: TOLERANCES[file],
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
