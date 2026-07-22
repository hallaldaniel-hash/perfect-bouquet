/**
 * Slices public/flower-grid.png (an 8 x 6 contact sheet) into one PNG per
 * flower at public/flowers/<slug>.png.
 *
 * Each grid cell shows the flower artwork with its printed caption underneath.
 * The caption bands are NOT perfectly evenly spaced on the source sheet (the
 * last row sits ~11px earlier than a linear model predicts), so rather than
 * assume a uniform pitch we detect each row's caption by scanning for its dark
 * text pixels, then crop the artwork strictly between captions.
 *
 * Run with:  npx tsx scripts/slice-flowers.ts
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { flowerCatalog, GRID_COLUMNS, GRID_ROWS } from "../prisma/flowerData";

const SOURCE = path.join(process.cwd(), "public", "flower-grid.png");
const OUT_DIR = path.join(process.cwd(), "public", "flowers");

const DARK_LUMA = 130; // below this counts as caption ink
const PAD = 5; // breathing room away from a caption band

interface Band {
  start: number;
  end: number;
}

/** Median of a list of numbers (list is copied before sorting). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Find the caption band for one row.
 *
 * The caption is always the LOWEST ink in a cell (blank card and the inter-row
 * gap sit beneath it), so we scan upward from the bottom of the search window
 * and take the first run of text-like rows. Scanning downward instead would
 * catch stems and leaves, which sit above the caption. Results are taken as a
 * median across the row's columns, since captions share a baseline.
 */
function findCaptionBand(
  data: Buffer,
  imgWidth: number,
  channels: number,
  rowTop: number,
  cellWidth: number,
  cellHeight: number,
): Band {
  const from = Math.round(rowTop + cellHeight * 0.72);
  const to = Math.round(rowTop + cellHeight * 1.05);
  const starts: number[] = [];
  const ends: number[] = [];

  for (let column = 0; column < GRID_COLUMNS; column += 1) {
    const x0 = Math.round(column * cellWidth) + 12;
    const x1 = Math.round((column + 1) * cellWidth) - 12;
    const span = x1 - x0;

    let runEnd: number | null = null;
    let runStart: number | null = null;

    for (let y = to; y >= from; y -= 1) {
      let dark = 0;
      for (let x = x0; x < x1; x += 1) {
        const i = (y * imgWidth + x) * channels;
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < DARK_LUMA) dark += 1;
      }
      // Caption text is sparse ink; flower mass would blanket the row.
      const isText = dark > 2 && dark < span * 0.6;

      if (isText) {
        if (runEnd === null) runEnd = y;
        runStart = y;
      } else if (runEnd !== null && runStart !== null) {
        if (runEnd - runStart >= 4) break; // lowest solid run = the caption
        runEnd = null;
        runStart = null;
      }
    }

    if (runStart !== null && runEnd !== null && runEnd - runStart >= 4) {
      starts.push(runStart);
      ends.push(runEnd);
    }
  }

  if (starts.length === 0) {
    // Nothing detected — fall back to the nominal bottom of the cell.
    return { start: Math.round(rowTop + cellHeight * 0.9), end: Math.round(rowTop + cellHeight) };
  }
  return { start: median(starts), end: median(ends) };
}

async function main() {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const cellWidth = width / GRID_COLUMNS;
  const cellHeight = height / GRID_ROWS;

  const expected = GRID_COLUMNS * GRID_ROWS;
  if (flowerCatalog.length !== expected) {
    throw new Error(
      `flowerCatalog has ${flowerCatalog.length} entries but the grid holds ${expected}.`,
    );
  }

  // Detect every row's caption, then derive each row's artwork window: below the
  // previous row's caption, above its own.
  const captions: Band[] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    captions.push(
      findCaptionBand(data, width, channels, row * cellHeight, cellWidth, cellHeight),
    );
  }

  const windows = captions.map((caption, row) => {
    const top = row === 0
      ? Math.round(cellHeight * 0.03)
      : captions[row - 1].end + PAD;
    const bottom = caption.start - PAD;
    return { top, bottom, height: bottom - top };
  });

  // One uniform size for every slice keeps the selector grid visually even.
  const artworkHeight = Math.min(...windows.map((w) => w.height));
  if (artworkHeight <= 0) throw new Error("Could not find a usable artwork window.");

  await mkdir(OUT_DIR, { recursive: true });

  for (const [index, flower] of flowerCatalog.entries()) {
    const row = Math.floor(index / GRID_COLUMNS);
    const column = index % GRID_COLUMNS;

    const left = Math.round(column * cellWidth);
    const cropWidth = Math.round((column + 1) * cellWidth) - left;

    await sharp(SOURCE)
      .extract({ left, top: windows[row].top, width: cropWidth, height: artworkHeight })
      .png()
      .toFile(path.join(OUT_DIR, `${flower.slug}.png`));
  }

  console.log(
    `Sliced ${flowerCatalog.length} flowers into public/flowers ` +
      `(${Math.round(cellWidth)}x${artworkHeight} each).`,
  );
  console.log(
    "Detected caption bands:",
    captions.map((c) => `${c.start}-${c.end}`).join(", "),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
