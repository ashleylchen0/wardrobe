/**
 * Reports which item photos still carry their backdrop.
 *
 * The check that matters is transparency, and specifically transparency at the
 * *border* of the stored image. A photo whose fill only cleared a margin looks
 * identical to a clean cutout once it is composited on the closet tile — both
 * read as a garment on a pale field — but the trim has cropped the cleared
 * margin away, so every edge pixel is opaque and the backdrop is still there.
 *
 *   npx tsx --env-file=.env.local scripts/audit-backgrounds.ts
 */

import { get } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import sharp from "sharp";

const sql = neon(process.env.DATABASE_URL!);

/** Alpha at or below this counts as cut away. */
const CLEAR = 8;

/** Width of the border ring inspected, as a share of the short edge. */
const RING_FRACTION = 0.03;

/**
 * Share of the ring that has to be transparent before a photo counts as cut
 * out. A real cutout is nearly all transparent around the edge; the exception
 * is a subject cropped tight to the frame, which is why the overall figure is
 * printed too rather than judged.
 */
const RING_CLEAR_MIN = 0.25;

export type Audit = {
  name: string;
  category: string;
  imagePath: string;
  transparent: number;
  ringTransparent: number;
  cutOut: boolean;
};

export async function auditPhoto(pathname: string) {
  const source = await get(pathname, { access: "private" });
  if (!source) return null;

  const raw = Buffer.from(await new Response(source.stream).arrayBuffer());
  const { data, info } = await sharp(raw)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const ring = Math.max(2, Math.round(Math.min(width, height) * RING_FRACTION));
  let clearPixels = 0;
  let ringPixels = 0;
  let ringClear = 0;

  for (let y = 0; y < height; y++) {
    const edgeRow = y < ring || y >= height - ring;
    for (let x = 0; x < width; x++) {
      const transparent = data[(y * width + x) * channels + channels - 1] <= CLEAR;
      if (transparent) clearPixels += 1;
      if (edgeRow || x < ring || x >= width - ring) {
        ringPixels += 1;
        if (transparent) ringClear += 1;
      }
    }
  }

  return {
    transparent: clearPixels / (width * height),
    ringTransparent: ringClear / Math.max(1, ringPixels),
    width,
    height,
  };
}

async function main() {
  const rows = await sql`
    select name, category, image_path from items
    where image_path is not null
    order by category, name`;

  const audits: Audit[] = [];

  for (const row of rows) {
    const result = await auditPhoto(row.image_path as string);
    if (!result) {
      console.log(`MISSING BLOB  ${row.name}`);
      continue;
    }
    audits.push({
      name: row.name as string,
      category: row.category as string,
      imagePath: row.image_path as string,
      transparent: result.transparent,
      ringTransparent: result.ringTransparent,
      cutOut: result.ringTransparent >= RING_CLEAR_MIN,
    });
  }

  const keeping = audits.filter((a) => !a.cutOut);
  console.log(
    `${audits.length} photos — ${audits.length - keeping.length} cut out, ${keeping.length} still on a backdrop\n`,
  );

  for (const a of keeping) {
    console.log(
      `${a.category.padEnd(12)} ${a.name.padEnd(36)} ` +
        `edge ${(a.ringTransparent * 100).toFixed(0).padStart(3)}% clear  ` +
        `frame ${(a.transparent * 100).toFixed(0).padStart(3)}% clear`,
    );
  }
}

if (process.argv[1]?.endsWith("audit-backgrounds.ts")) main();
