// No-network, no-filesystem tests for the reference-set assembly. The flower
// image loader is always injected with an in-memory generator, so nothing is
// fetched or read from disk.

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  assembleReferenceSet,
  boardGrid,
  describeBoardPosition,
  type FlowerImageLoader,
} from "./bouquetReferences";
import { MAX_REFERENCE_DIMENSION, MAX_INPUT_IMAGES } from "./generationConfig";

async function blueprintBytes(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 800, channels: 3, background: { r: 240, g: 230, b: 220 } },
  })
    .jpeg()
    .toBuffer();
}

// A loader that returns a distinct solid WebP (the real thumbnail format) per
// slug. Never touches disk or network.
const workingLoader: FlowerImageLoader = async (slug) => {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) % 255;
  return sharp({
    create: { width: 480, height: 480, channels: 3, background: { r: hash, g: 120, b: 200 } },
  })
    .webp()
    .toBuffer();
};

async function assertWithinLimit(bytes: Buffer) {
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok((meta.width ?? 999) <= MAX_REFERENCE_DIMENSION, "width within limit");
  assert.ok((meta.height ?? 999) <= MAX_REFERENCE_DIMENSION, "height within limit");
}

test("<=3 varieties: one direct flower reference per variety, in order", async () => {
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: ["White Rose", "Pink Rose", "Tulip"],
    loadFlowerImage: workingLoader,
  });

  assert.equal(set.flowerReferencesOmitted, false);
  assert.equal(set.usedBoard, false);
  assert.deepEqual(
    set.images.map((i) => i.field),
    ["input_image_0", "input_image_1", "input_image_2", "input_image_3"],
  );
  assert.equal(set.images[0].kind, "blueprint");
  assert.deepEqual(set.images.slice(1).map((i) => i.kind), ["flower", "flower", "flower"]);
  assert.deepEqual(
    set.images.slice(1).map((i) => i.flowers[0].name),
    ["White Rose", "Pink Rose", "Tulip"],
  );
  for (const image of set.images) await assertWithinLimit(image.bytes);
});

test("exactly 3 varieties fills all four slots (blueprint + 3 flowers)", async () => {
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: ["White Rose", "Pink Rose", "Tulip"],
    loadFlowerImage: workingLoader,
  });
  assert.equal(set.images.length, MAX_INPUT_IMAGES);
});

test(">3 varieties: a single reference board holding every selected variety", async () => {
  const selected = ["White Rose", "Pink Rose", "Tulip", "Peony", "Anemone"];
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: selected,
    loadFlowerImage: workingLoader,
  });

  assert.equal(set.usedBoard, true);
  assert.equal(set.flowerReferencesOmitted, false);
  assert.equal(set.images.length, 2); // blueprint + one board
  assert.equal(set.images[1].kind, "board");
  assert.deepEqual(set.images[1].flowers.map((t) => t.name), selected);
  // Every tile has a stable, non-empty position label.
  assert.ok(set.images[1].flowers.every((t) => t.position.length > 0));
  await assertWithinLimit(set.images[1].bytes);
});

test("never exceeds Cloudflare's four-image cap, even for many varieties", async () => {
  const many = [
    "White Rose", "Pink Rose", "Tulip", "Peony", "Anemone",
    "Sunflower", "Hydrangea", "Ranunculus",
  ];
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: many,
    loadFlowerImage: workingLoader,
  });
  assert.ok(set.images.length <= MAX_INPUT_IMAGES);
});

test("deduplicates repeated selections while preserving order", async () => {
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: ["White Rose", "White Rose", "Pink Rose"],
    loadFlowerImage: workingLoader,
  });
  assert.deepEqual(set.images.slice(1).map((i) => i.flowers[0].name), ["White Rose", "Pink Rose"]);
});

test("an unresolvable flower image falls back to blueprint-only (never a wrong substitute)", async () => {
  const brokenLoader: FlowerImageLoader = async (slug) => {
    if (slug === "pink-rose") return Buffer.from("not an image at all");
    return workingLoader(slug);
  };
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: ["White Rose", "Pink Rose", "Tulip"],
    loadFlowerImage: brokenLoader,
  });
  assert.equal(set.flowerReferencesOmitted, true);
  assert.equal(set.images.length, 1);
  assert.equal(set.images[0].kind, "blueprint");
  assert.equal(typeof set.omissionReason, "string");
});

test("a missing flower file falls back to blueprint-only", async () => {
  const missingLoader: FlowerImageLoader = async () => {
    throw new Error("ENOENT: no such file");
  };
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: ["White Rose"],
    loadFlowerImage: missingLoader,
  });
  assert.equal(set.flowerReferencesOmitted, true);
  assert.equal(set.images.length, 1);
});

test("unknown flower names are ignored, not resolved to a path", async () => {
  const seen: string[] = [];
  const trackingLoader: FlowerImageLoader = async (slug) => {
    seen.push(slug);
    return workingLoader(slug);
  };
  const set = await assembleReferenceSet({
    blueprintBytes: await blueprintBytes(),
    selectedFlowers: ["White Rose", "Definitely Not A Real Flower"],
    loadFlowerImage: trackingLoader,
  });
  // Only the known catalog slug was ever handed to the loader.
  assert.deepEqual(seen, ["white-rose"]);
  assert.deepEqual(set.images.slice(1).map((i) => i.flowers[0].name), ["White Rose"]);
});

test("boardGrid produces a near-square, fully-covering grid", () => {
  assert.deepEqual(boardGrid(4), { rows: 2, cols: 2 });
  assert.deepEqual(boardGrid(5), { rows: 2, cols: 3 });
  assert.deepEqual(boardGrid(9), { rows: 3, cols: 3 });
  assert.ok(boardGrid(7).rows * boardGrid(7).cols >= 7);
});

test("describeBoardPosition is readable for small grids and explicit for large", () => {
  assert.equal(describeBoardPosition(0, 0, 2, 2), "top-left");
  assert.equal(describeBoardPosition(1, 1, 2, 2), "bottom-right");
  assert.equal(describeBoardPosition(2, 3, 5, 5), "row 3, column 4");
});
