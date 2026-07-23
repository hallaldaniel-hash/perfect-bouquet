// Assembles the ordered set of reference images sent to Cloudflare FLUX.2 for
// one bouquet generation, plus the index -> role mapping the prompt uses to
// describe each image. Keeping both in one place means the multipart request
// and the prompt can never disagree about what input_image_<n> actually is.
//
// Reference-slot policy (Cloudflare allows at most 4 input images):
//   input_image_0        -> the structural blueprint (always present)
//   input_image_1 .. _3  -> flower identity references
//     * 1..3 selected varieties  -> one catalog thumbnail per variety
//     * 4+ selected varieties    -> a single deterministic reference board
//                                   holding every selected variety in a grid
//
// Flower images are resolved from the TRUSTED catalog constant (name -> slug)
// and read from local repository assets. No client-supplied URL is ever
// fetched, and no remote network request is made. Slugs are fixed constant
// strings, so the on-disk path can never be influenced by client input.

import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp, { type OverlayOptions } from "sharp";
import { flowerCatalog } from "@/prisma/flowerData";
import { normalizeReferenceImage, ReferenceImageError } from "@/lib/referenceImages";
import {
  MAX_REFERENCE_DIMENSION,
  MAX_FLOWER_REFERENCE_SLOTS,
  MAX_INPUT_IMAGES,
} from "@/lib/generationConfig";

const SLUG_BY_NAME = new Map(flowerCatalog.map((flower) => [flower.name, flower.slug]));

/** Loads the raw bytes of a flower's catalog artwork by its trusted slug. */
export type FlowerImageLoader = (slug: string) => Promise<Buffer>;

/**
 * Default loader: the bloom-focused square catalog thumbnail from local public
 * assets. No network. The path is built only from a trusted catalog slug (a
 * fixed constant), so path traversal is not possible.
 */
export const defaultFlowerImageLoader: FlowerImageLoader = async (slug) => {
  const file = path.join(process.cwd(), "public", "flowers", "thumbs", `${slug}.webp`);
  return readFile(file);
};

export type ReferenceRoleKind = "blueprint" | "flower" | "board";

export interface BoardTile {
  name: string;
  /** Human-readable grid position, e.g. "top-left" or "row 2, column 3". */
  position: string;
}

/** What a given input_image_<index> represents — consumed by the prompt builder. */
export interface ReferenceRole {
  index: number;
  field: string;
  kind: ReferenceRoleKind;
  /** For "flower": one entry (position ""). For "board": one per tile. Empty for blueprint. */
  flowers: BoardTile[];
}

export interface AssembledReference extends ReferenceRole {
  bytes: Buffer;
  filename: string;
}

export interface ReferenceSet {
  images: AssembledReference[];
  roles: ReferenceRole[];
  usedBoard: boolean;
  /** True if flower references were dropped and only the blueprint is attached. */
  flowerReferencesOmitted: boolean;
  /** Content-free reason when flowerReferencesOmitted is true (for diagnostics). */
  omissionReason?: string;
}

export interface AssembleReferenceSetInput {
  blueprintBytes: Buffer;
  /** Already validated against the catalog allowlist by the caller. */
  selectedFlowers: string[];
  loadFlowerImage?: FlowerImageLoader;
}

function fieldName(index: number): string {
  return `input_image_${index}`;
}

/** Coarse, unambiguous grid-position label used to map board tiles in the prompt. */
export function describeBoardPosition(row: number, col: number, rows: number, cols: number): string {
  // Small grids read naturally as top/middle/bottom + left/center/right; larger
  // grids would make those labels ambiguous, so fall back to explicit indices.
  if (rows <= 3 && cols <= 3) {
    const vertical = rows === 1 ? "" : row === 0 ? "top" : row === rows - 1 ? "bottom" : "middle";
    const horizontal = cols === 1 ? "" : col === 0 ? "left" : col === cols - 1 ? "right" : "center";
    const label = [vertical, horizontal].filter(Boolean).join("-");
    if (label) return label;
  }
  return `row ${row + 1}, column ${col + 1}`;
}

/** Grid dimensions for n tiles: a near-square grid, filled row-major. */
export function boardGrid(n: number): { rows: number; cols: number } {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { rows, cols };
}

/**
 * Composite every selected flower's thumbnail into a single reference board on a
 * neutral background. Deterministic: catalog order in, stable grid positions out.
 * No text is drawn onto the board — tile identity is mapped by grid position in
 * the prompt instead, so the model is never shown text it could reproduce.
 */
async function buildBoard(
  tiles: { name: string; bytes: Buffer }[],
): Promise<{ bytes: Buffer; tiles: BoardTile[] }> {
  const { rows, cols } = boardGrid(tiles.length);
  const cellW = Math.floor(MAX_REFERENCE_DIMENSION / cols);
  const cellH = Math.floor(MAX_REFERENCE_DIMENSION / rows);
  const pad = Math.max(2, Math.floor(Math.min(cellW, cellH) * 0.06));
  const innerW = cellW - pad * 2;
  const innerH = cellH - pad * 2;

  const composites: OverlayOptions[] = [];
  const placed: BoardTile[] = [];

  for (let i = 0; i < tiles.length; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const tileBytes = await sharp(tiles[i].bytes)
      .rotate()
      .flatten({ background: { r: 244, g: 239, b: 229 } })
      .resize({ width: innerW, height: innerH, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
    composites.push({ input: tileBytes, top: row * cellH + pad, left: col * cellW + pad });
    placed.push({ name: tiles[i].name, position: describeBoardPosition(row, col, rows, cols) });
  }

  const boardBytes = await sharp({
    create: {
      width: MAX_REFERENCE_DIMENSION,
      height: MAX_REFERENCE_DIMENSION,
      channels: 3,
      background: { r: 244, g: 239, b: 229 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  // Guarantee compliance through the same single path everything else uses.
  const normalized = await normalizeReferenceImage(boardBytes);
  return { bytes: normalized.bytes, tiles: placed };
}

/**
 * Build the full ordered reference set for one generation.
 *
 * - input_image_0 is always the normalised blueprint. If the blueprint cannot be
 *   normalised, this throws ReferenceImageError (the caller should return 400).
 * - Flower references are all-or-nothing: if any selected flower's image cannot
 *   be loaded or normalised, ALL flower references are dropped and only the
 *   blueprint is attached (flowerReferencesOmitted=true). A partial/mismatched
 *   set is never sent, and a wrong flower image is never substituted.
 */
export async function assembleReferenceSet(input: AssembleReferenceSetInput): Promise<ReferenceSet> {
  const loadFlowerImage = input.loadFlowerImage ?? defaultFlowerImageLoader;

  const blueprint = await normalizeReferenceImage(input.blueprintBytes);
  const blueprintImage: AssembledReference = {
    index: 0,
    field: fieldName(0),
    kind: "blueprint",
    flowers: [],
    bytes: blueprint.bytes,
    filename: "bouquet-blueprint.jpg",
  };

  // Dedupe defensively while preserving selection order; only known catalog
  // names survive (they were validated upstream, but never trust that here).
  const seen = new Set<string>();
  const varieties: { name: string; slug: string }[] = [];
  for (const name of input.selectedFlowers) {
    if (seen.has(name)) continue;
    const slug = SLUG_BY_NAME.get(name);
    if (!slug) continue;
    seen.add(name);
    varieties.push({ name, slug });
  }

  const blueprintOnly = (reason: string): ReferenceSet => ({
    images: [blueprintImage],
    roles: [{ index: 0, field: blueprintImage.field, kind: "blueprint", flowers: [] }],
    usedBoard: false,
    flowerReferencesOmitted: true,
    omissionReason: reason,
  });

  if (varieties.length === 0) {
    return blueprintOnly("no resolvable selected flowers");
  }
  // Defensive: cannot exceed the catalog, and a single board holds them all.
  if (varieties.length > flowerCatalog.length) {
    return blueprintOnly("selection exceeds catalog size");
  }

  try {
    const loaded = await Promise.all(
      varieties.map(async (v) => ({ name: v.name, bytes: await loadFlowerImage(v.slug) })),
    );

    const flowerImages: AssembledReference[] = [];

    if (varieties.length <= MAX_FLOWER_REFERENCE_SLOTS) {
      // One direct identity reference per variety.
      for (let i = 0; i < loaded.length; i += 1) {
        const normalized = await normalizeReferenceImage(loaded[i].bytes);
        const index = i + 1;
        flowerImages.push({
          index,
          field: fieldName(index),
          kind: "flower",
          flowers: [{ name: loaded[i].name, position: "" }],
          bytes: normalized.bytes,
          filename: `flower-${index}.jpg`,
        });
      }
    } else {
      // More than three varieties: one reference board in slot 1.
      const board = await buildBoard(loaded);
      flowerImages.push({
        index: 1,
        field: fieldName(1),
        kind: "board",
        flowers: board.tiles,
        bytes: board.bytes,
        filename: "flower-board.jpg",
      });
    }

    const images = [blueprintImage, ...flowerImages];
    if (images.length > MAX_INPUT_IMAGES) {
      // Unreachable given the slot policy, but never send an over-cap request.
      return blueprintOnly("reference slot cap exceeded");
    }

    return {
      images,
      roles: images.map(({ index, field, kind, flowers }) => ({ index, field, kind, flowers })),
      usedBoard: varieties.length > MAX_FLOWER_REFERENCE_SLOTS,
      flowerReferencesOmitted: false,
    };
  } catch (error) {
    // A missing or undecodable flower asset must never yield a wrong or partial
    // identity set — fall back to the blueprint alone. The text prompt still
    // carries the full selected-flower allowlist, so identity is preserved by
    // name even without per-image references.
    const reason = error instanceof ReferenceImageError ? "flower image invalid" : "flower image unavailable";
    return blueprintOnly(reason);
  }
}
