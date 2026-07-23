// No-network tests for reference-image normalisation. All fixtures are built in
// memory with sharp; nothing is fetched or read from disk.

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeReferenceImage, ReferenceImageError } from "./referenceImages";
import { MAX_REFERENCE_DIMENSION } from "./generationConfig";

function solidImage(width: number, height: number, format: "jpeg" | "png" | "webp") {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 140 } },
  });
  return (format === "jpeg" ? base.jpeg() : format === "png" ? base.png() : base.webp()).toBuffer();
}

test("downscales an oversized image to within the reference limit and re-encodes as JPEG", async () => {
  const result = await normalizeReferenceImage(await solidImage(1024, 768, "jpeg"));
  assert.equal(result.resized, true);
  assert.ok(result.width <= MAX_REFERENCE_DIMENSION);
  assert.ok(result.height <= MAX_REFERENCE_DIMENSION);
  const meta = await sharp(result.bytes).metadata();
  assert.equal(meta.format, "jpeg");
});

test("preserves aspect ratio when downscaling", async () => {
  const result = await normalizeReferenceImage(await solidImage(1000, 500, "jpeg"));
  // 2:1 source -> longest edge clamped to the limit, other edge halved.
  assert.equal(result.width, MAX_REFERENCE_DIMENSION);
  assert.equal(result.height, MAX_REFERENCE_DIMENSION / 2);
});

test("does not enlarge an image already within the limit", async () => {
  const result = await normalizeReferenceImage(await solidImage(200, 200, "png"));
  assert.equal(result.resized, false);
  assert.equal(result.width, 200);
  assert.equal(result.height, 200);
});

test("accepts and converts WebP (the catalog thumbnail format) to JPEG", async () => {
  const result = await normalizeReferenceImage(await solidImage(480, 480, "webp"));
  assert.equal(result.sourceFormat, "webp");
  const meta = await sharp(result.bytes).metadata();
  assert.equal(meta.format, "jpeg");
});

test("rejects an empty buffer", async () => {
  await assert.rejects(() => normalizeReferenceImage(Buffer.alloc(0)), ReferenceImageError);
});

test("rejects bytes sharp cannot decode", async () => {
  await assert.rejects(
    () => normalizeReferenceImage(Buffer.from("this is definitely not an image")),
    ReferenceImageError,
  );
});

test("rejects an animated GIF (unsupported format)", async () => {
  // A minimal animated GIF (2 frames). sharp reports format 'gif', which is not
  // in the supported set, so it is rejected before any frame is used.
  const animatedGif = Buffer.from(
    "R0lGODlhAQABAPABAP///wAAACH/C05FVFNDQVBFMi4wAwEAAAAh/wtYTVAgRGF0YVhNUA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAh+QQFAAABACwAAAAAAQABAAAC" +
      "AkQBACH5BAUAAAEALAAAAAABAAEAAAICRAEAOw==",
    "base64",
  );
  await assert.rejects(() => normalizeReferenceImage(animatedGif), ReferenceImageError);
});

test("normalises EXIF orientation without throwing", async () => {
  // Orientation 6 (rotate 90). Just assert it processes to a valid within-limit JPEG.
  const oriented = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const result = await normalizeReferenceImage(oriented);
  assert.ok(result.width <= MAX_REFERENCE_DIMENSION);
  assert.ok(result.height <= MAX_REFERENCE_DIMENSION);
});
