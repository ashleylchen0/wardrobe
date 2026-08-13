/**
 * Emits real item cutouts as base64 data URIs, keyed by name, on stdout.
 *
 *   npx tsx scripts/inline-thumbs.ts > thumbs.json
 *
 * For mockups that have to be judged at true scale — a layout reads completely
 * differently against placeholder blocks than against the actual garments — and
 * that must survive as a single self-contained file with no blob access.
 *
 * The item list below is a working set, not a fixed one; edit it for whatever
 * is being mocked up. Progress and sizes go to stderr so stdout stays JSON.
 */
import { get } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import sharp from "sharp";
const sql = neon(process.env.DATABASE_URL!);
const NAMES = ["black zip up", "levis dad jeans blue", "Panda Dunks", "black strappy tank aritzia", "APC brown leather bag", "green quilted puffer", "white baby tee", "black wide cargos"];
async function main() {
  const out: Record<string, string> = {};
  for (const name of NAMES) {
    const rows = await sql`select name, brand, category, image_path from items where name = ${name}`;
    if (!rows.length || !rows[0].image_path) { console.error(`skip ${name}`); continue; }
    const src = await get(rows[0].image_path as string, { access: "private" });
    const buf = Buffer.from(await new Response(src!.stream).arrayBuffer());
    const small = await sharp(buf).resize({ width: 150, height: 190, fit: "inside" }).webp({ quality: 72, alphaQuality: 90 }).toBuffer();
    out[name] = `data:image/webp;base64,${small.toString("base64")}`;
    console.error(`${name}  ${(small.length / 1024).toFixed(1)}KB  ${rows[0].brand} / ${rows[0].category}`);
  }
  process.stdout.write(JSON.stringify(out));
}
main();
