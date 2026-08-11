import sharp from "sharp";

/**
 * Background removal for product shots, shared by the upload paths and the
 * batch scripts so a photo added through the app matches one processed offline.
 *
 * These are e-commerce images on a studio backdrop, so this floods inward from
 * the edges rather than running a segmentation model. Two things stop the
 * flood: the colour has to stay close to the backdrop, and it may not cross a
 * contour. The second is what makes a white shirt on a white wall possible —
 * there the garment sits within a couple of levels of the backdrop and colour
 * alone cannot tell them apart, but the silhouette is still a clean edge.
 *
 * It does not generalise to photos shot in a room: the fit below refuses those
 * outright rather than eating the subject.
 */

/** Long edge of a stored photo. Matches the browser-side downscale. */
export const MAX_EDGE = 1200;

const QUALITY = 82;

/**
 * Cap before analysis. The fill allocates several full-frame buffers, and a
 * 4000px listing image costs a few hundred MB and several seconds for detail
 * that the 1200px output throws away. Still above MAX_EDGE so the cut edge is
 * computed at better-than-final resolution.
 */
const ANALYSIS_EDGE = 2000;

/**
 * How far a pixel may sit from the *fitted* backdrop and still count as
 * background, as an RGB distance. Measured against the local prediction rather
 * than a single sampled colour, so it only has to cover the noise around the
 * backdrop, not the studio gradient running across it.
 *
 * Derived from the fit rather than fixed, because the right value differs by an
 * order of magnitude between sources. A retouched packshot has a backdrop that
 * is *mathematically* constant and a garment eight levels off it, so anything
 * above single digits swallows the garment; a photographed backdrop carries
 * grain worth several levels and needs room for it. The residual of the fit
 * measures exactly that, so the tolerance is a multiple of it.
 */
const TOLERANCE_SLACK = 5;
const TOLERANCE_FLOOR = 4;
const TOLERANCE_CEILING = 40;

/**
 * Sobel magnitude, on a 0-255 scale, above which a pixel counts as a contour
 * the fill may not cross. Deliberately low: the silhouette of a white garment
 * on a white backdrop is a soft edge worth only a few levels, and the blur
 * below has already removed the compression noise that would otherwise sit at
 * this height.
 */
const EDGE_LIMIT = 4;

/**
 * Contours come out of the Sobel dashed wherever the garment briefly matches
 * the backdrop exactly, and the fill pours through a single-pixel gap and eats
 * the subject. Widening the contour closes those gaps.
 */
const EDGE_DILATE = 2;

/**
 * The fill stops one pixel short of the contour, which would leave a rim of
 * backdrop around the cutout. Growing the finished mask back over the contour
 * trims that rim off, at the cost of a pixel of garment.
 */
const CHOKE = 2;

/** Alpha blur radius, in pixels, keeping the cut edge from looking jagged. */
const FEATHER = 0.8;

/**
 * Screenshots tend to carry a one-pixel dark frame from the capture. It breaks
 * the backdrop fit and, being off-backdrop, survives the fill and then anchors
 * the trim — so shave a few pixels off every edge before looking at anything.
 */
const BORDER_PX = 6;

/** Width of the border ring the backdrop is fitted to, as a share of the short edge. */
const RING_FRACTION = 0.02;
const RING_MIN_PX = 8;

/**
 * Share of ring samples that must survive outlier rejection. A packshot's ring
 * is nearly all backdrop; a photo shot in a room has furniture, a floor line
 * and a wall in it, and no smooth surface fits more than a fraction of it.
 */
const MIN_INLIERS = 0.6;

/** Largest RMS error, in levels, between the fitted backdrop and its inliers. */
const MAX_RESIDUAL = 9;

/**
 * Largest share of the frame an enclosed backdrop-coloured region may cover and
 * still be treated as a hole in the subject rather than as the subject.
 */
const HOLE_MAX_FRACTION = 0.05;

/** How much wider the shadow pass runs than the pass that found the backdrop. */
const SHADOW_SLACK = 5;

/**
 * Share of the frame the shadow pass may add before it is thrown away. A cast
 * shadow is worth a few percent — the shadow under the linen trousers is 4. A
 * pass that has found its way through the contour and into the garment takes
 * noticeably more, so the cut sits just above the shadows.
 */
const SHADOW_EXTRA_MAX = 0.05;

/**
 * What to do with backdrop-coloured regions the border fill cannot reach — the
 * gap under a bag's handle, or inside a belt loop.
 *
 * `keep`, the default, restricts removal to background connected to the border.
 * `clear` also removes enclosed pockets, which is what a bag with a handle
 * wants — but a pale garment is full of blown-out folds that match the backdrop
 * exactly and are indistinguishable from a real gap, so ask for it per photo
 * rather than assuming it.
 */
export type Holes = "clear" | "keep";

export type KnockoutOptions = {
  /** Overrides the tolerance derived from the backdrop fit. */
  tolerance?: number;
  holes?: Holes;
  /**
   * How badly the backdrop may fail to fit a smooth surface before the photo is
   * rejected as something other than a packshot, as an RMS error in levels.
   */
  maxResidual?: number;
  /** Sobel magnitude that counts as a contour. Raise it on a noisy scan. */
  edgeLimit?: number;
};

export class NotFlatBackdropError extends Error {
  constructor(detail: string) {
    super(`background is not a studio backdrop (${detail})`);
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

/**
 * Least squares fit of `a + b·u + c·v + d·u² + e·v² + f·uv` per channel, over
 * the border ring. Quadratic rather than a flat average because studio
 * backdrops are lit from one side and drift tens of levels corner to corner —
 * a constant would force the tolerance so wide that it swallowed the garment.
 */
const TERMS = 6;

function basis(u: number, v: number, out: Float64Array) {
  out[0] = 1;
  out[1] = u;
  out[2] = v;
  out[3] = u * u;
  out[4] = v * v;
  out[5] = u * v;
}

/** Gaussian elimination with partial pivoting; `a` is TERMS x (TERMS + 1). */
function solve(a: Float64Array): Float64Array | null {
  const n = TERMS;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row * (n + 1) + col]) > Math.abs(a[pivot * (n + 1) + col])) pivot = row;
    }
    if (Math.abs(a[pivot * (n + 1) + col]) < 1e-9) return null;
    if (pivot !== col) {
      for (let k = col; k <= n; k++) {
        const t = a[col * (n + 1) + k];
        a[col * (n + 1) + k] = a[pivot * (n + 1) + k];
        a[pivot * (n + 1) + k] = t;
      }
    }
    for (let row = col + 1; row < n; row++) {
      const factor = a[row * (n + 1) + col] / a[col * (n + 1) + col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) a[row * (n + 1) + k] -= factor * a[col * (n + 1) + k];
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = a[row * (n + 1) + n];
    for (let k = row + 1; k < n; k++) sum -= a[row * (n + 1) + k] * x[k];
    x[row] = sum / a[row * (n + 1) + row];
  }
  return x;
}

type Backdrop = {
  /** Predicted backdrop colour at every pixel, RGB interleaved. */
  model: Uint8ClampedArray;
  residual: number;
  inlierFraction: number;
};

/** The colour distance that counts as backdrop, given how well the fit landed. */
function toleranceFor(backdrop: Backdrop) {
  return Math.min(
    TOLERANCE_CEILING,
    Math.max(TOLERANCE_FLOOR, TOLERANCE_SLACK * backdrop.residual),
  );
}

function fitBackdrop(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
): Backdrop {
  const ring = Math.max(RING_MIN_PX, Math.round(Math.min(width, height) * RING_FRACTION));

  const samples: number[] = [];
  for (let y = 0; y < height; y++) {
    const vertical = y < ring || y >= height - ring;
    for (let x = 0; x < width; x++) {
      if (!vertical && x >= ring && x < width - ring) {
        x = width - ring - 1; // skip the interior of this row
        continue;
      }
      samples.push(y * width + x);
    }
  }

  const terms = new Float64Array(TERMS);

  // Start from the ring's dominant colour rather than from all of it. A
  // retailer screenshot puts two flat surfaces in the ring — the page white and
  // the panel the product sits on — and a least squares fit over both lands
  // between them and matches neither. Bucketing finds whichever covers most of
  // the ring, and that is the backdrop the subject stands on.
  const BUCKET = 16;
  const buckets = new Map<number, number[]>();
  for (const p of samples) {
    const i = p * channels;
    const key =
      ((data[i] / BUCKET) | 0) * 4096 +
      ((data[i + 1] / BUCKET) | 0) * 64 +
      ((data[i + 2] / BUCKET) | 0);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }

  const dominant = [...buckets.values()].sort((a, b) => b.length - a.length)[0];
  const centre = [0, 1, 2].map(
    (c) => dominant.reduce((sum, p) => sum + data[p * channels + c], 0) / dominant.length,
  );

  // Everything within a bucket's width of that colour, so a backdrop straddling
  // a bucket boundary is not cut in half by the quantisation.
  let keep = samples.filter((p) => {
    const i = p * channels;
    return (
      Math.abs(data[i] - centre[0]) <= BUCKET &&
      Math.abs(data[i + 1] - centre[1]) <= BUCKET &&
      Math.abs(data[i + 2] - centre[2]) <= BUCKET
    );
  });
  if (!keep.length) throw new NotFlatBackdropError("the border has no dominant colour");
  let coefficients: Float64Array[] = [];
  let residual = 0;

  // Fit, throw out whatever the surface cannot explain, fit again. Garments run
  // off the edge of plenty of these frames, and a single pass would let those
  // pixels drag the surface toward the subject.
  for (let pass = 0; pass < 2; pass++) {
    coefficients = [];
    for (let c = 0; c < 3; c++) {
      const normal = new Float64Array(TERMS * (TERMS + 1));
      for (const p of keep) {
        const x = p % width;
        const y = (p / width) | 0;
        basis(x / width - 0.5, y / height - 0.5, terms);
        const value = data[p * channels + c];
        for (let i = 0; i < TERMS; i++) {
          for (let j = 0; j < TERMS; j++) normal[i * (TERMS + 1) + j] += terms[i] * terms[j];
          normal[i * (TERMS + 1) + TERMS] += terms[i] * value;
        }
      }
      const solved = solve(normal);
      if (!solved) throw new NotFlatBackdropError("the border ring is degenerate");
      coefficients.push(solved);
    }

    const errors = keep.map((p) => {
      const x = p % width;
      const y = (p / width) | 0;
      basis(x / width - 0.5, y / height - 0.5, terms);
      let worst = 0;
      for (let c = 0; c < 3; c++) {
        let predicted = 0;
        for (let i = 0; i < TERMS; i++) predicted += coefficients[c][i] * terms[i];
        worst = Math.max(worst, Math.abs(data[p * channels + c] - predicted));
      }
      return worst;
    });

    const sorted = [...errors].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const spread = sorted[Math.floor(sorted.length * 0.75)] - median;
    const cut = Math.max(6, median + 3 * spread);

    if (pass === 0) {
      keep = keep.filter((_, i) => errors[i] <= cut);
      if (!keep.length) throw new NotFlatBackdropError("no part of the border fits a surface");
    } else {
      const inliers = errors.filter((e) => e <= cut);
      residual = Math.sqrt(
        inliers.reduce((sum, e) => sum + e * e, 0) / Math.max(1, inliers.length),
      );
    }
  }

  const model = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      basis(x / width - 0.5, y / height - 0.5, terms);
      const p = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        let predicted = 0;
        for (let i = 0; i < TERMS; i++) predicted += coefficients[c][i] * terms[i];
        model[p + c] = predicted;
      }
    }
  }

  return { model, residual, inlierFraction: keep.length / samples.length };
}

/**
 * Contour map: 1 wherever the image turns fast enough to be an edge. Blurred
 * first, because webp and jpeg both leave ringing in flat areas that is easily
 * as strong as the silhouette of a pale garment.
 */
function edgeMask(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
  limit: number,
): Uint8Array {
  const grey = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Separable 3x3 box blur, twice: cheap, and enough to settle the noise floor.
  const smooth = new Float32Array(width * height);
  for (let pass = 0; pass < 2; pass++) {
    const source = pass === 0 ? grey : smooth;
    const scratch = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const l = source[y * width + Math.max(0, x - 1)];
        const c = source[y * width + x];
        const r = source[y * width + Math.min(width - 1, x + 1)];
        scratch[y * width + x] = (l + c + r) / 3;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = scratch[Math.max(0, y - 1) * width + x];
        const c = scratch[y * width + x];
        const b = scratch[Math.min(height - 1, y + 1) * width + x];
        smooth[y * width + x] = (t + c + b) / 3;
      }
    }
  }

  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -smooth[i - width - 1] - 2 * smooth[i - 1] - smooth[i + width - 1] +
        smooth[i - width + 1] + 2 * smooth[i + 1] + smooth[i + width + 1];
      const gy =
        -smooth[i - width - 1] - 2 * smooth[i - width] - smooth[i - width + 1] +
        smooth[i + width - 1] + 2 * smooth[i + width] + smooth[i + width + 1];
      if (Math.sqrt(gx * gx + gy * gy) / 4 >= limit) edges[i] = 1;
    }
  }

  return dilate(edges, width, height, EDGE_DILATE);
}

/** Grows a mask by `radius` pixels, four-connected. */
function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  let current = mask;
  for (let step = 0; step < radius; step++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (current[p]) continue;
        if (
          (x > 0 && current[p - 1]) ||
          (x < width - 1 && current[p + 1]) ||
          (y > 0 && current[p - width]) ||
          (y < height - 1 && current[p + width])
        ) {
          next[p] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

type Fill = {
  isBackground: Uint8Array;
  cleared: number;
};

/**
 * The fill itself, shared by the knockout and the stability probe so there is
 * only ever one definition of what counts as background.
 */
function floodBackground(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
  backdrop: Backdrop,
  edges: Uint8Array,
  tolerance: number,
  holes: Holes,
  seed?: Uint8Array,
): Fill {
  const { model } = backdrop;
  const limit = tolerance * tolerance;

  const nearBackdrop = (p: number) => {
    const i = p * channels;
    const m = p * 3;
    const dr = data[i] - model[m];
    const dg = data[i + 1] - model[m + 1];
    const db = data[i + 2] - model[m + 2];
    return dr * dr + dg * dg + db * db <= limit;
  };

  const isBackground = seed ? new Uint8Array(seed) : new Uint8Array(width * height);
  const stack: number[] = [];

  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (isBackground[p] || edges[p] || !nearBackdrop(p)) return;
    isBackground[p] = 1;
    stack.push(x, y);
  };

  if (seed) {
    // Continue outward from a fill that has already run, rather than reseeding
    // from the border: a wider pass is only safe where the tight one has
    // already established that it is standing on background.
    for (let p = 0; p < width * height; p++) {
      if (seed[p]) stack.push(p % width, (p / width) | 0);
    }
  }

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
  // backdrop trapped under a bag strap looking like a solid panel. Collect what
  // is left of the frame into connected pockets and clear the small ones.
  //
  // The size cap is what makes this safe on a pale garment: its interior is
  // also within tolerance of the backdrop, so a colour-only sweep would clear
  // the garment and leave nothing but its outline. A pocket under a strap is a
  // few percent of the frame; the inside of a shirt is never that small.
  if (holes === "clear") {
    const cap = width * height * HOLE_MAX_FRACTION;
    const seen = new Uint8Array(width * height);

    for (let start = 0; start < width * height; start++) {
      if (seen[start] || isBackground[start] || edges[start] || !nearBackdrop(start)) {
        continue;
      }

      const pocket: number[] = [];
      const queue = [start];
      seen[start] = 1;

      while (queue.length) {
        const p = queue.pop()!;
        pocket.push(p);
        const x = p % width;
        const y = (p / width) | 0;
        const neighbours = [
          x > 0 ? p - 1 : -1,
          x < width - 1 ? p + 1 : -1,
          y > 0 ? p - width : -1,
          y < height - 1 ? p + width : -1,
        ];
        for (const q of neighbours) {
          if (q < 0 || seen[q] || isBackground[q] || edges[q] || !nearBackdrop(q)) continue;
          seen[q] = 1;
          queue.push(q);
        }
      }

      if (pocket.length <= cap) for (const p of pocket) isBackground[p] = 1;
    }
  }

  const cleared = isBackground.reduce((n: number, v) => n + v, 0) / (width * height);
  return { isBackground, cleared };
}

/** Decode, cap the resolution and shave the capture frame. */
async function analysisBuffer(input: Buffer, edge: number) {
  const capped = await sharp(input)
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
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

  return sharp(deframed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

export async function knockout(
  input: Buffer,
  {
    tolerance,
    holes = "keep",
    maxResidual = MAX_RESIDUAL,
    edgeLimit = EDGE_LIMIT,
  }: KnockoutOptions = {},
): Promise<{ buffer: Buffer; cleared: number }> {
  const { data, info } = await analysisBuffer(input, ANALYSIS_EDGE);
  const { width, height, channels } = info;

  const backdrop = fitBackdrop(data, width, height, channels);
  if (backdrop.inlierFraction < MIN_INLIERS) {
    throw new NotFlatBackdropError(
      `only ${(backdrop.inlierFraction * 100).toFixed(0)}% of the border fits one surface`,
    );
  }
  if (backdrop.residual > maxResidual) {
    throw new NotFlatBackdropError(
      `the border is ${backdrop.residual.toFixed(1)} levels off a smooth surface`,
    );
  }

  const edges = edgeMask(data, width, height, channels, edgeLimit);
  const working = tolerance ?? toleranceFor(backdrop);

  const tight = floodBackground(
    data,
    width,
    height,
    channels,
    backdrop,
    edges,
    working,
    holes,
  );

  // A tolerance tight enough to spare a white garment leaves the soft shadow it
  // casts on the backdrop behind, as a grey smear on the tile. Run again, much
  // wider, from where the first pass stopped: a shadow ramps gently and the
  // second pass walks down it, while the garment's own contour still blocks the
  // way. If that costs more of the frame than a shadow ever would, the wide
  // pass has found a way into the subject and the tight result stands.
  const wide = floodBackground(
    data,
    width,
    height,
    channels,
    backdrop,
    edges,
    working * SHADOW_SLACK,
    holes,
    tight.isBackground,
  );
  const filled = wide.cleared - tight.cleared <= SHADOW_EXTRA_MAX ? wide : tight;

  // Grow the mask back over the contour the fill stopped at, so the cutout does
  // not keep a rim of backdrop all the way around it.
  const isBackground = dilate(filled.isBackground, width, height, CHOKE);

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

  const cleared =
    isBackground.reduce((n: number, v) => n + v, 0) / (width * height);
  return { buffer, cleared };
}

/** Resolution for the stability probe. Small: only the ratio matters. */
const PROBE_EDGE = 1000;

/**
 * Largest share of the frame the cleared area may move across the probe, before
 * the fill is treated as having found no real boundary to stop at.
 */
const MAX_DRIFT = 0.08;

/** Multipliers applied to the working tolerance, well either side of it. */
const PROBE_SCALES = [0.5, 1, 2];

/**
 * Measures whether the fill is stopping somewhere real, by running it at
 * several tolerances and watching how much the cleared area moves.
 *
 * A cutout that lands in the same place at half and twice the threshold is
 * bounded by a contour or by a genuine colour gap. One that keeps growing is
 * walking through the subject, and the photo is better off untouched.
 */
async function backdropDrift(input: Buffer, edgeLimit: number) {
  const { data, info } = await analysisBuffer(input, PROBE_EDGE);
  const { width, height, channels } = info;

  const backdrop = fitBackdrop(data, width, height, channels);
  const edges = edgeMask(data, width, height, channels, edgeLimit);
  const tolerance = toleranceFor(backdrop);

  const values = PROBE_SCALES.map(
    (scale) =>
      floodBackground(
        data,
        width,
        height,
        channels,
        backdrop,
        edges,
        tolerance * scale,
        "keep",
      ).cleared,
  );

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
    if ((await backdropDrift(input, EDGE_LIMIT)) > MAX_DRIFT) {
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
    // Includes a backdrop that isn't one, which is a routine outcome rather
    // than a fault. Never let image processing cost you the upload.
    try {
      return { buffer: await plain(input), knockedOut: false };
    } catch {
      return { buffer: input, knockedOut: false };
    }
  }
}
