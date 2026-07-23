// Shared generation-pipeline constants, imported by both the reference-image
// preprocessing and the request construction so the two can never disagree on
// Cloudflare's limits.
//
// Cloudflare FLUX.2 [dev] on Workers AI:
// - accepts up to FOUR reference images, named input_image_0 .. input_image_3
// - every reference image must be STRICTLY smaller than 512x512
// https://developers.cloudflare.com/changelog/post/2025-11-25-flux-2-dev-workers-ai/

/** Longest edge (px) any reference image may have. 480 is safely below the
 *  documented "smaller than 512x512" hard limit while leaving a margin so a
 *  rounding or re-encode can't push a dimension to 512. */
export const MAX_REFERENCE_DIMENSION = 480;

/** Cloudflare's hard cap on reference images per request. */
export const MAX_INPUT_IMAGES = 4;

/** input_image_0 is always the structural blueprint. */
export const BLUEPRINT_SLOTS = 1;

/** Reference slots left for flower identity references after the blueprint. */
export const MAX_FLOWER_REFERENCE_SLOTS = MAX_INPUT_IMAGES - BLUEPRINT_SLOTS; // 3
