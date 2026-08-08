import sharp from "sharp";

/**
 * Background removal for product shots, shared by the upload paths and the
 * batch scripts so a photo added through the app matches one processed offline.
 *
 * These are e-commerce images on a flat studio backdrop, so this floods inward
 * from the edges rather than running a segmentation model: the fill is exact
 * where the backdrop really is flat, and refuses outright where it isn't. It
 * does not generalise to photos shot in a room.
 */

/** Long edge of a stored photo. Matches the browser-side downscale. */
export const MAX_EDGE = 1200;

const QUALITY = 82;

/**
 * Cap before analysis. The fill allocates a mask and a raw RGBA buffer over
 * every pixel, and a 4000px listing image costs ~80MB and several seconds for
 * detail that the 1200px output throws away. Still above MAX_EDGE so the cut
 * edge is computed at better-than-final resolution.
 */
const ANALYSIS_EDGE = 2000;

/**
 * How far a pixel may sit from the sampled backdrop colour and still count as
 * background, as a squared RGB distance. Generous enough to swallow soft
 * gradient studio shadows, tight enough to stop at a garment edge.
 */
const TOLERANCE = 42;

/** Alpha blur radius, in pixels, keeping the cut edge from looking jagged. */
const FEATHER = 0.8;

/**
 * Screenshots tend to carry a one-pixel dark frame from the capture. It breaks
 * the corner sample and, being off-backdrop, survives the fill and then anchors
 * the trim — so shave a few pixels off every edge before looking at anything.
 */
const BORDER_PX = 6;

/**
 * What to do with backdrop-coloured regions the border fill cannot reach — the
 * gap under a bag's handle, or inside a belt loop.
 *
 * `clear` also removes them, which is what a product shot on a flat backdrop
 * almost always wants. `keep` restricts removal to background connected to the
 * border, the safe choice when the subject itself contains areas the same
 * colour as the backdrop that would otherwise be punched through.
 */
export type Holes = "clear" | "keep";

export type KnockoutOptions = {
  tolerance?: number;
  holes?: Holes;
  /**
   * How far the four corners may disagree before the photo is rejected as
   * non-uniform. Studio shots often carry a gentle vignette, so a few levels is
   * normal; a large spread means the fill would eat the subject.
   */
  maxSpread?: number;
};

export class NotFlatBackdropError extends Error {
  constructor(spread: number) {
    super(`background is not uniform (corners differ by ${spread})`);
    this.name = "NotFlatBackdropError";
  }
}

/** Resize and re-encode without touching the background. */
export async function plain(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
}

export async function knockout(
  input: Buffer,
  { tolerance = TOLERANCE, holes = "clear", maxSpread = 12 }: KnockoutOptions = {},
): Promise<{ buffer: Buffer; cleared: number }> {
  const capped = await sharp(input)
    .rotate()
    .resize({
      width: ANALYSIS_EDGE,
      height: ANALYSIS_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const framed = sharp(capped);
  const frame = await framed.metadata();
  if (frame.width! <= BORDER_PX * 2 || frame.height! <= BORDER_PX * 2) {
    throw new Error("image is too small to process");
  }

  const deframed = await framed
    .extract({
      left: BORDER_PX,
      top: BORDER_PX,
      width: frame.width! - BORDER_PX * 2,
      height: frame.height! - BORDER_PX * 2,
    })
    .png()
    .toBuffer();

  const { data, info } = await sharp(deframed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const at = (x: number, y: number) => (y * width + x) * channels;

  // Sample the backdrop from the corners. If they disagree the photo is not a
  // flat studio shot and the flood fill would eat the subject.
  const corners = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1),
  ].map((i) => [data[i], data[i + 1], data[i + 2]]);

  const spread = Math.max(
    ...corners.flatMap((a) =>
      corners.map((b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])))),
    ),
  );
  if (spread > maxSpread) throw new NotFlatBackdropError(spread);

  const [br, bg, bb] = corners[0];

  // Iterative flood fill from every border pixel. A stack rather than recursion
  // because these images run to a few million pixels.
  const isBackground = new Uint8Array(width * height);
  const stack: number[] = [];

  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (isBackground[p]) return;
    const i = p * channels;
    const dr = data[i] - br;
    const dg = data[i + 1] - bg;
    const db = data[i + 2] - bb;
    if (dr * dr + dg * dg + db * db > tolerance * tolerance) return;
    isBackground[p] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    consider(x, 0);
    consider(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    consider(0, y);
    consider(width - 1, y);
  }

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    consider(x + 1, y);
    consider(x - 1, y);
    consider(x, y + 1);
    consider(x, y - 1);
  }

  // The border fill stops at anything it cannot walk to, which leaves the
  // backdrop trapped under a bag strap looking like a solid white panel. Sweep
  // the whole frame for the same colour to catch those pockets.
  if (holes === "clear") {
    for (let p = 0; p < width * height; p++) {
      if (isBackground[p]) continue;
      const i = p * channels;
      const dr = data[i] - br;
      const dg = data[i + 1] - bg;
      const db = data[i + 2] - bb;
      if (dr * dr + dg * dg + db * db <= tolerance * tolerance) isBackground[p] = 1;
    }
  }

  const cleared = isBackground.reduce((n: number, v) => n + v, 0) / (width * height);

  // Build the alpha channel separately so it can be feathered on its own; a
  // blur across the colour channels would smear the subject itself.
  const alpha = Buffer.alloc(width * height);
  for (let p = 0; p < width * height; p++) {
    alpha[p] = isBackground[p] ? 0 : data[p * channels + 3];
  }

  // `toColourspace("b-w")` is load-bearing: blurring a one-channel raw buffer
  // otherwise returns three channels, and the oversized result silently
  // misaligns every pixel that reads from it.
  const softAlpha = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(FEATHER)
    .toColourspace("b-w")
    .raw()
    .toBuffer();

  if (softAlpha.length !== width * height) {
    throw new Error(
      `feathered alpha is ${softAlpha.length} bytes, expected ${width * height}`,
    );
  }

  // Write the feathered alpha straight back into the RGBA buffer rather than
  // going through joinChannel, which reorders against resize inside a single
  // pipeline and would attach full-size alpha to already-shrunken colour data.
  for (let p = 0; p < width * height; p++) {
    data[p * channels + 3] = softAlpha[p];
  }

  const joined = await sharp(data, { raw: { width, height, channels } })
    .png()
    .toBuffer();

  const buffer = await sharp(joined)
    .trim({ threshold: 1 }) // drop the now-empty margin so the subject fills the frame
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY, alphaQuality: 100 })
    .toBuffer();

  return { buffer, cleared };
}

/** Resolution for the stability probe. Small: only the ratio matters. */
const PROBE_EDGE = 1000;

/**
 * Largest share of the frame the cleared area may move by as the tolerance is
 * widened. Calibrated against the current library: genuine packshots sit under
 * 1.5% because there is a real colour gap between subject and backdrop, so
 * widening the threshold finds nothing new. Photos where the fill is walking
 * through the subject drift 5% and up.
 */
const MAX_DRIFT = 0.03;

/**
 * Deliberately wide. A narrow sweep around the default barely moves even on a
 * white-on-white shot — the fill has already swallowed the subject at every
 * value in the range, so it looks stable. Probing well below and well above the
 * working tolerance is what exposes the absence of a real edge to stop at.
 */
const PROBE_TOLERANCES = [20, 42, 70];

/**
 * Measures whether a real colour gap separates subject from backdrop, by
 * filling at several tolerances and watching how much the cleared area moves.
 *
 * This is the guard that stops a white tee on a white wall from being quietly
 * shredded: there, every extra point of tolerance eats further into the shirt,
 * so the cleared area keeps climbing. Against a black garment on grey the fill
 * lands in exactly the same place every time.
 */
async function backdropDrift(input: Buffer): Promise<number> {
  const capped = await sharp(input)
    .rotate()
    .resize({ width: PROBE_EDGE, height: PROBE_EDGE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(capped).metadata();
  if (meta.width! <= BORDER_PX * 2 || meta.height! <= BORDER_PX * 2) return 1;

  const deframed = await sharp(capped)
    .extract({
      left: BORDER_PX,
      top: BORDER_PX,
      width: meta.width! - BORDER_PX * 2,
      height: meta.height! - BORDER_PX * 2,
    })
    .png()
    .toBuffer();

  const { data, info } = await sharp(deframed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const [br, bg, bb] = [data[0], data[1], data[2]];

  const clearedAt = (tolerance: number) => {
    const isBackground = new Uint8Array(width * height);
    const stack: number[] = [];
    const consider = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const p = y * width + x;
      if (isBackground[p]) return;
      const i = p * channels;
      const dr = data[i] - br;
      const dg = data[i + 1] - bg;
      const db = data[i + 2] - bb;
      if (dr * dr + dg * dg + db * db > tolerance * tolerance) return;
      isBackground[p] = 1;
      stack.push(x, y);
    };
    for (let x = 0; x < width; x++) {
      consider(x, 0);
      consider(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      consider(0, y);
      consider(width - 1, y);
    }
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      consider(x + 1, y);
      consider(x - 1, y);
      consider(x, y + 1);
      consider(x, y - 1);
    }
    return isBackground.reduce((n: number, v) => n + v, 0) / (width * height);
  };

  const values = PROBE_TOLERANCES.map(clearedAt);
  return Math.max(...values) - Math.min(...values);
}

export type NormalizeResult = {
  buffer: Buffer;
  /** False when the backdrop wasn't flat enough and the photo was only resized. */
  knockedOut: boolean;
};

/**
 * What the upload paths call. Attempts a knockout and falls back to a plain
 * resize on any failure — a photo that cannot be cut out is still a perfectly
 * good photo, and losing the upload over it would be much worse than keeping
 * the backdrop.
 */
export async function normalizePhoto(input: Buffer): Promise<NormalizeResult> {
  try {
    if ((await backdropDrift(input)) > MAX_DRIFT) {
      return { buffer: await plain(input), knockedOut: false };
    }

    const { buffer, cleared } = await knockout(input);

    // A fill that clears almost nothing found no backdrop worth removing; a
    // fill that clears almost everything has eaten the subject. Neither result
    // is worth keeping over the untouched photo.
    if (cleared < 0.05 || cleared > 0.985) {
      return { buffer: await plain(input), knockedOut: false };
    }
    return { buffer, knockedOut: true };
  } catch {
    // Includes a non-flat backdrop, which is a routine outcome rather than a
    // fault. Never let image processing cost you the upload.
    try {
      return { buffer: await plain(input), knockedOut: false };
    } catch {
      return { buffer: input, knockedOut: false };
    }
  }
}
