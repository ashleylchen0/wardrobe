/**
 * Composites cut-out photos onto magenta so the knockout can be eyeballed.
 *
 *   npx tsx scripts/flatten-on-magenta.ts <src-dir> <out-dir> [name...]
 *
 * Transparent fringing is invisible against a white page and obvious against
 * #ff00ff, which is why the backdrop is a colour no garment ever is. Trailing
 * arguments filter by substring of the filename, for checking one item.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
const SRC = process.argv[2], OUT = process.argv[3];
const only = process.argv.slice(4);
async function main() {
  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(SRC)) {
    if (!/\.(webp|png)$/.test(f)) continue;
    if (only.length && !only.some((o) => f.toLowerCase().includes(o.toLowerCase()))) continue;
    const buf = await sharp(join(SRC, f)).toBuffer();
    const m = await sharp(buf).metadata();
    const flat = await sharp({ create: { width: m.width!, height: m.height!, channels: 3, background: "#ff00ff" } })
      .composite([{ input: buf }]).png().toBuffer();
    await writeFile(join(OUT, f.replace(/\.webp$/, ".png")), flat);
  }
}
main();
