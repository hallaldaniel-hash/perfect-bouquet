// Builds the flower SELECTOR thumbnails: bloom-focused, uniformly framed
// squares.
//
// Source: public/flowers/<slug>.png (the full card artwork).
// Output: public/flowers/thumbs/<slug>.png
//
// The full artwork is deliberately left untouched — the AI bouquet canvas
// composites from it, and that output must not change. Only the picker uses
// these thumbnails.
//
// Detection is EDGE-based, not colour-based. The card backdrop carries a strong
// vignette (corners of a single image vary by 20+ RGB points), so thresholding
// against a flat background colour misclassifies the vignette as content and
// anchors the crop on empty backdrop. A vignette is smooth, though, so it has
// no edges — while a flower is full of them. Gradient magnitude separates the
// two cleanly and works equally well for white flowers on cream.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = "public/flowers";
const OUT_DIR = "public/flowers/thumbs";
const SIZE = 480; // output square, retina-comfortable at ~224px display
const BLOOM_FILL = 0.82; // share of the frame the bloom should occupy
const EDGE_THRESHOLD = 10; // gradient magnitude that counts as detail
const MIN_RUN = 8; // min edge pixels for a row/column to count as content

/** Edge-magnitude mask + per-row/column counts. */
async function edgeMask(file) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const gray = await img.clone().greyscale().raw().toBuffer();
  const at = (x, y) => gray[y * width + x];

  const mask = new Uint8Array(width * height);
  const rowCount = new Array(height).fill(0);
  const colCount = new Array(width).fill(0);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx = Math.abs(at(x + 1, y) - at(x - 1, y));
      const gy = Math.abs(at(x, y + 1) - at(x, y - 1));
      if (gx + gy >= EDGE_THRESHOLD) {
        mask[y * width + x] = 1;
        rowCount[y] += 1;
        colCount[x] += 1;
      }
    }
  }

  let minY = -1, maxY = -1, minX = -1, maxX = -1;
  for (let y = 0; y < height; y += 1) if (rowCount[y] >= MIN_RUN) { minY = y; break; }
  for (let y = height - 1; y >= 0; y -= 1) if (rowCount[y] >= MIN_RUN) { maxY = y; break; }
  for (let x = 0; x < width; x += 1) if (colCount[x] >= MIN_RUN) { minX = x; break; }
  for (let x = width - 1; x >= 0; x -= 1) if (colCount[x] >= MIN_RUN) { maxX = x; break; }
  if (minY < 0 || minX < 0) return null;

  return { width, height, mask, rowCount, colCount, minX, minY, maxX, maxY };
}

/** Horizontal extent of edge pixels on one row (0 if the row is just noise). */
function rowExtent(box, y) {
  if (box.rowCount[y] < MIN_RUN) return null;
  let first = -1, last = -1;
  for (let x = box.minX; x <= box.maxX; x += 1) {
    if (box.mask[y * box.width + x]) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return first < 0 ? null : { first, last, w: last - first + 1 };
}

/**
 * Where the bloom ends and the stem begins. Scans down from the top of the
 * content tracking the widest row SO FAR — the neck is where the silhouette
 * narrows sharply relative to the mass above it. A running max (rather than the
 * global max) matters: for a rose the widest row is the lower leaves, so a
 * global max would place the cut below them and drag the stem into frame.
 */
function bloomBottom(box) {
  let runningMax = 0;
  for (let y = box.minY; y <= box.maxY; y += 1) {
    const ext = rowExtent(box, y);
    const w = ext ? ext.w : 0;
    if (w > runningMax) runningMax = w;
    if (runningMax === 0) continue;
    if (w < runningMax * 0.34) {
      // Confirm it stays narrow, so a gap between petals isn't taken for a neck.
      let staysNarrow = true;
      for (let k = y; k < Math.min(y + 30, box.maxY); k += 1) {
        const e = rowExtent(box, k);
        if ((e ? e.w : 0) >= runningMax * 0.34) { staysNarrow = false; break; }
      }
      if (staysNarrow) return y;
    }
  }
  return box.maxY; // no clear stem (fern, hydrangea) — keep the whole thing
}

async function buildThumb(slug) {
  const src = path.join(SRC_DIR, `${slug}.png`);
  const box = await edgeMask(src);
  if (!box) throw new Error(`no content detected in ${slug}`);

  const bottom = bloomBottom(box);

  // Horizontal extent of the BLOOM ROWS ONLY — using the full content box here
  // lets wide lower leaves inflate the square and pull the stem back in.
  let bMinX = box.maxX, bMaxX = box.minX;
  for (let y = box.minY; y <= bottom; y += 1) {
    const ext = rowExtent(box, y);
    if (!ext) continue;
    if (ext.first < bMinX) bMinX = ext.first;
    if (ext.last > bMaxX) bMaxX = ext.last;
  }
  if (bMaxX < bMinX) { bMinX = box.minX; bMaxX = box.maxX; }

  const bloomH = bottom - box.minY + 1;
  const bloomW = bMaxX - bMinX + 1;

  let side = Math.round(Math.max(bloomW, bloomH) / BLOOM_FILL);
  side = Math.min(side, box.width, box.height);

  const cx = (bMinX + bMaxX) / 2;
  const cy = box.minY + bloomH / 2;

  // Keep the square fully inside the image by shifting (not shrinking) it, so
  // framing stays square and nothing gets letterboxed.
  const left = Math.round(Math.min(Math.max(cx - side / 2, 0), box.width - side));
  const top = Math.round(Math.min(Math.max(cy - side / 2, 0), box.height - side));

  // fit: "cover" fills the square from the source, so the backdrop is the
  // artwork's own cream edge-to-edge — no padded border in a slightly different
  // tone, which would show as a visible frame.
  // WebP, not PNG: these are photographs shown at ~224px and the picker loads
  // all 48 at once. PNG came to ~17MB total, which is a punishing mobile load.
  await sharp(src)
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE, { fit: "cover" })
    .webp({ quality: 82 })
    .toFile(path.join(OUT_DIR, `${slug}.webp`));

  return { slug, bloomW, bloomH, side, bottom, contentTop: box.minY };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const slugs = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.replace(/\.png$/, ""));

for (const slug of slugs) {
  await buildThumb(slug);
}
console.log(`built ${slugs.length} thumbnails -> ${OUT_DIR}`);
