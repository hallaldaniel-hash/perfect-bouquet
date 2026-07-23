// Server-side reference-image preprocessing for Cloudflare FLUX.2 conditioning.
//
// Every image handed to Cloudflare as a reference (input_image_0 .. _3) passes
// through normalizeReferenceImage first, so the request can never send an image
// that is the wrong format, animated, mis-oriented, or over the documented
// "smaller than 512x512" limit.
//
// This module performs CPU work only (via sharp). It makes NO network calls and
// NEVER logs raw image bytes or base64 content — only safe, derived metadata
// (dimensions, byte length, format) is ever surfaced to callers for diagnostics.

import sharp, { type Metadata } from "sharp";
import { MAX_REFERENCE_DIMENSION } from "@/lib/generationConfig";

/** A caller-safe error whose message contains no image content. */
export class ReferenceImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceImageError";
  }
}

// Formats sharp can decode that we accept as reference input. Deliberately
// excludes animated containers (gif) — an animation frame is not a valid still
// reference and would be rejected below anyway.
const SUPPORTED_INPUT_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "avif", "tiff"]);

// Neutral studio background used to flatten any transparency, so a PNG/WebP with
// an alpha channel never renders its transparent regions as black.
const NEUTRAL_BACKGROUND = { r: 244, g: 239, b: 229 };

export interface NormalizedReference {
  /** Re-encoded JPEG bytes, guaranteed within the reference-size limit. */
  bytes: Buffer;
  width: number;
  height: number;
  /** True if the source exceeded the limit and was downscaled. */
  resized: boolean;
  /** Source format (for diagnostics only). */
  sourceFormat: string;
}

/**
 * Decode, validate and normalise an arbitrary image buffer into a JPEG that is
 * strictly within Cloudflare's reference-image limit.
 *
 * - Rejects empty buffers, anything sharp cannot decode, and unsupported or
 *   animated formats — with a ReferenceImageError carrying no image content.
 * - Normalises EXIF orientation.
 * - Flattens transparency onto a neutral background.
 * - Resizes to fit inside MAX_REFERENCE_DIMENSION^2 preserving aspect ratio.
 * - Never enlarges an image that is already within the limit.
 */
export async function normalizeReferenceImage(input: Buffer): Promise<NormalizedReference> {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new ReferenceImageError("Empty reference image.");
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new ReferenceImageError("Unreadable reference image.");
  }

  const format = (metadata.format ?? "").toLowerCase();
  if (!SUPPORTED_INPUT_FORMATS.has(format)) {
    throw new ReferenceImageError(`Unsupported reference image format: ${format || "unknown"}.`);
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new ReferenceImageError("Animated reference images are not supported.");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new ReferenceImageError("Reference image has no readable dimensions.");
  }

  const needsResize = width > MAX_REFERENCE_DIMENSION || height > MAX_REFERENCE_DIMENSION;

  let outputBytes: Buffer;
  try {
    outputBytes = await sharp(input, { failOn: "error" })
      .rotate() // bake in EXIF orientation, then strip it
      .flatten({ background: NEUTRAL_BACKGROUND })
      .resize({
        width: MAX_REFERENCE_DIMENSION,
        height: MAX_REFERENCE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new ReferenceImageError("Reference image could not be processed.");
  }

  const outMeta = await sharp(outputBytes).metadata();
  return {
    bytes: outputBytes,
    width: outMeta.width ?? Math.min(width, MAX_REFERENCE_DIMENSION),
    height: outMeta.height ?? Math.min(height, MAX_REFERENCE_DIMENSION),
    resized: needsResize,
    sourceFormat: format,
  };
}
