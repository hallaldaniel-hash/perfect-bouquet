// Verifies every generated thumbnail actually contains a flower, and that the
// bloom fills a sane share of the frame. Catches blank/near-blank crops that
// spot-checking a handful of files would miss.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const DIR = "public/flowers/thumbs";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));

const rows = [];
for (const f of files) {
  const img = sharp(path.join(DIR, f));
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const px = (x, y) => {
    const i = (y * width + x) * 4;
    return [raw[i], raw[i + 1], raw[i + 2]];
  };
  const corners = [px(2, 2), px(width - 3, 2), px(2, height - 3), px(width - 3, height - 3)];
  const median = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const bg = [0, 1, 2].map((c) => median(corners.map((p) => p[c])));

  let content = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const [r, g, b] = px(x, y);
      if (Math.abs(r - bg[0]) > 18 || Math.abs(g - bg[1]) > 18 || Math.abs(b - bg[2]) > 18) content += 1;
    }
  }
  const total = Math.ceil(width / 2) * Math.ceil(height / 2);
  rows.push({ file: f, coverage: +((content / total) * 100).toFixed(1) });
}

rows.sort((a, b) => a.coverage - b.coverage);
const bad = rows.filter((r) => r.coverage < 8);
console.log("=== lowest coverage ===");
for (const r of rows.slice(0, 12)) console.log(`${r.coverage.toString().padStart(5)}%  ${r.file}`);
console.log(`\ntotal: ${rows.length}`);
console.log(`suspicious (<8% content): ${bad.length}`);
if (bad.length) console.log(bad.map((b) => b.file).join(", "));
