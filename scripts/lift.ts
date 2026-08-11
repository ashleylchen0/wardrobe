/**
 * Background removal for photos that are not packshots — a mirror selfie, a
 * garment worn on the street, a bag on a pavement.
 *
 * `src/lib/knockout.ts` floods inward from the edges and refuses anything whose
 * border is not one smooth surface, which is the right call for that technique:
 * a room has a floor line, a wall and furniture in the ring, and there is no
 * backdrop colour to sample. Those photos need actual matting, so this shells
 * out to Vision's foreground instance mask via `lift.swift`.
 *
 * That is macOS-only and deliberately confined to the batch scripts. The upload
 * path in `src/lib` runs on Linux in Vercel, where this does not exist — it
 * keeps falling back to a plain resize, which is why photos shot in a room
 * should be brought in through `attach-photos.ts` rather than the in-app
 * uploader.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { MAX_EDGE } from "../src/lib/knockout";

const run = promisify(execFile);

const SOURCE = join(import.meta.dirname, "lift.swift");
/** Compiled once and cached; node_modules is already ignored by git. */
const BINARY = join(import.meta.dirname, "..", "node_modules", ".cache", "wardrobe", "lift");

const QUALITY = 82;

/** Exit code `lift.swift` uses when Vision found nothing to lift. */
const NO_SUBJECT = 3;

export class NoSubjectError extends Error {
  constructor() {
    super("Vision found no foreground subject to lift");
    this.name = "NoSubjectError";
  }
}

async function newerThanBinary() {
  try {
    const [source, binary] = await Promise.all([stat(SOURCE), stat(BINARY)]);
    return source.mtimeMs > binary.mtimeMs;
  } catch {
    return true; // not built yet
  }
}

/** Builds `lift.swift` on first use, and again whenever the source changes. */
async function build() {
  if (!(await newerThanBinary())) return;
  await mkdir(join(BINARY, ".."), { recursive: true });
  await run("swiftc", ["-O", "-o", BINARY, SOURCE]);
}

/**
 * Cuts the subject out and returns webp matching what `knockout` produces, so a
 * lifted photo and a flood-filled one are interchangeable downstream.
 */
export async function lift(input: Buffer): Promise<Buffer> {
  await build();

  const scratch = join(tmpdir(), `lift-${process.pid}-${Date.now()}`);
  await mkdir(scratch, { recursive: true });
  const from = join(scratch, "in.png");
  const to = join(scratch, "out.png");

  try {
    // Vision reads the file itself, and hands back a PNG cropped to the
    // subject's extent — so the trim below only has to catch the feathered rim.
    await sharp(input).rotate().png().toFile(from);

    try {
      await run(BINARY, [from, to]);
    } catch (error) {
      if ((error as { code?: number }).code === NO_SUBJECT) throw new NoSubjectError();
      throw error;
    }

    return sharp(await readFile(to))
      .trim({ threshold: 1 })
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY, alphaQuality: 100 })
      .toBuffer();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
