// Deterministic, structured bouquet prompt for Cloudflare FLUX.2.
//
// One pure function assembles the entire directive from validated selection data
// plus the reference-image role mapping, so the prompt's per-image instructions
// always match exactly what the multipart request attaches. Same input -> same
// string, every time: no randomness, no Date.now(), no I/O.
//
// The prompt is emitted as ordered, labelled plain-text sections rather than
// Cloudflare "JSON prompting". JSON prompting was considered; the owner-specified
// section template already expresses every constraint unambiguously, and plain
// text keeps the per-image index references (Image 0, Image 1, ...) legible to
// the model without a second layer of structure to misparse. No undocumented
// Cloudflare fields (e.g. negative_prompt) are relied upon.

import type { ReferenceRole } from "@/lib/bouquetReferences";

export interface FlowerAllocation {
  flower: string;
  count: number;
}

export interface BouquetPromptInput {
  stemCount: number;
  /** Selected flower names, selection order, validated against the catalog. */
  selectedFlowers: string[];
  /** One or two wrap names, validated against the wrap allowlist. */
  selectedWraps: string[];
  /** Hex colour for every wrap name. */
  wrapColors: Record<string, string>;
  /** Reference roles from assembleReferenceSet (index 0 = blueprint). */
  roles: ReferenceRole[];
}

export interface BouquetPromptResult {
  prompt: string;
  allocation: FlowerAllocation[];
}

/**
 * Strip anything that isn't a plain letter, digit, space, apostrophe or hyphen,
 * then collapse whitespace. Catalog text is trusted, but sanitising it before it
 * enters the prompt removes any chance of a stray control character or newline
 * breaking the section structure or being read as an instruction.
 */
export function sanitizeText(value: string): string {
  return value.replace(/[^\p{L}\p{N} '-]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Validate a CSS hex colour; fall back to a neutral placeholder if malformed. */
function safeHex(value: string | undefined): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value.toLowerCase() : "#cccccc";
}

/** Even split with the remainder going to the earliest-selected varieties. */
export function allocateStems(stemCount: number, selectedFlowers: string[]): FlowerAllocation[] {
  const n = selectedFlowers.length;
  const base = Math.floor(stemCount / n);
  const remainder = stemCount % n;
  return selectedFlowers.map((flower, index) => ({
    flower,
    count: base + (index < remainder ? 1 : 0),
  }));
}

/** Map each selected flower to a human phrase describing its reference image. */
function referenceDescriptors(roles: ReferenceRole[]): Map<string, string> {
  const byFlower = new Map<string, string>();
  for (const role of roles) {
    if (role.kind === "flower" && role.flowers[0]) {
      byFlower.set(role.flowers[0].name, `Image ${role.index}`);
    } else if (role.kind === "board") {
      for (const tile of role.flowers) {
        byFlower.set(tile.name, `the ${tile.position} tile of Image ${role.index}`);
      }
    }
  }
  return byFlower;
}

function buildReferenceRolesSection(roles: ReferenceRole[]): string {
  const lines = [
    "REFERENCE IMAGE ROLES",
    "Image 0 is the structural blueprint. Preserve its overall silhouette, relative flower placement, rounded bouquet shape, wrapping geometry, wrap-colour regions, and ribbon position. Convert the schematic into a realistic florist bouquet; do not reproduce it as an illustration.",
  ];

  const flowerRoles = roles.filter((role) => role.kind === "flower");
  const boardRole = roles.find((role) => role.kind === "board");

  for (const role of flowerRoles) {
    const name = sanitizeText(role.flowers[0]?.name ?? "");
    lines.push(
      `Image ${role.index} is the identity reference for ${name}. Use its petal structure, bloom shape, and colour only. Ignore its original background, container, crop, and arrangement.`,
    );
  }

  if (boardRole) {
    const tiles = boardRole.flowers
      .map((tile) => `${tile.position} = ${sanitizeText(tile.name)}`)
      .join("; ");
    lines.push(
      `Image ${boardRole.index} is a reference board of the selected flowers on a neutral background; each tile shows one flower's identity only. Ignore the board layout and tile backgrounds. Tiles by position: ${tiles}.`,
    );
  }

  if (flowerRoles.length === 0 && !boardRole) {
    lines.push(
      "No individual flower reference images are provided for this request; render every listed flower from its botanical identity using the allowlist below.",
    );
  } else {
    lines.push(
      "The flower reference images define flower identity only: species, bloom structure, petal shape, and colour. Ignore their original backgrounds, hands, containers, vases, packaging, text, watermarks, cropping, and arrangement.",
    );
  }

  return lines.join("\n");
}

function buildAllowlistSection(
  allocation: FlowerAllocation[],
  descriptors: Map<string, string>,
): string {
  const lines = [
    "SELECTED FLOWER ALLOWLIST",
    "The bouquet may contain only these selected flower varieties:",
  ];
  for (const item of allocation) {
    const name = sanitizeText(item.flower);
    const ref = descriptors.get(item.flower) ?? "its botanical identity (no separate reference image)";
    lines.push(`- ${name}: approximately ${item.count} stems; use the identity and colour shown in ${ref}.`);
  }
  lines.push(
    "Do not introduce roses, lilies, baby's breath, filler flowers, foliage, berries, or decorative plants unless they appear in this allowlist.",
  );
  return lines.join("\n");
}

function buildWrappingSection(selectedWraps: string[], wrapColors: Record<string, string>): string {
  const wraps = selectedWraps.map((name) => ({ name: sanitizeText(name), hex: safeHex(wrapColors[name]) }));
  const wrappingRule =
    wraps.length === 2
      ? `Use exactly the two selected wrapping colours: ${wraps[0].name} (${wraps[0].hex}) and ${wraps[1].name} (${wraps[1].hex}). The wrapping must be wide, layered, structured, and clearly visible around the lower half of the bouquet. Both colours must appear as distinct, clearly separated visible layers. Do not blend them into one ambiguous colour.`
      : `Use exactly one wrapping colour: ${wraps[0].name} (${wraps[0].hex}). The wrapping must be wide, layered, structured, and clearly visible around the lower half of the bouquet. Do not introduce any other wrapping colour.`;
  return [
    "WRAPPING AND RIBBON",
    wrappingRule,
    "Show one clearly visible ivory ribbon tied around the wrapped stems. The ribbon and knot must not be hidden by flowers or cropping.",
  ].join("\n");
}

/**
 * Assemble the full ordered directive: eleven labelled sections, populated only
 * from validated selection data and the reference-role mapping.
 */
export function buildBouquetPrompt(input: BouquetPromptInput): BouquetPromptResult {
  const { stemCount, selectedFlowers, selectedWraps, wrapColors, roles } = input;
  const allocation = allocateStems(stemCount, selectedFlowers);
  const descriptors = referenceDescriptors(roles);
  const allowlistNames = allocation.map((item) => sanitizeText(item.flower)).join(", ");

  const sections = [
    // 1
    "PRIMARY TASK\nCreate one photorealistic premium florist e-commerce product photograph of exactly one complete hand-tied bouquet.",
    // 2
    buildReferenceRolesSection(roles),
    // 3
    buildAllowlistSection(allocation, descriptors),
    // 4
    `FLOWER QUANTITIES AND PROPORTIONS\nRepresent the requested stem quantities and their relative proportions as closely as image generation permits. A flower with a larger requested quantity must occupy visibly more of the bouquet than one with a smaller requested quantity. The visible flower units should total approximately ${stemCount}. Distribute varieties naturally while preserving the blueprint's placement logic.`,
    // 5
    "BOUQUET STRUCTURE\nShow exactly one complete professional hand-tied florist bouquet. It must be rounded, full, dense, balanced, and front-facing. The bouquet must read as a finished retail florist product, not loose flowers, a vase arrangement, a garden scene, or flowers being carried.",
    // 6
    buildWrappingSection(selectedWraps, wrapColors),
    // 7
    "CAMERA AND FRAMING\nCentered, straight-on, eye-level professional product framing. Show the entire bouquet from the highest flower to the bottom edge of the wrapped section. Leave clean margin around every side. Do not crop flowers, wrapping, ribbon, or the bottom of the bouquet. The bouquet alone occupies approximately 75-85% of the image height.",
    // 8
    "LIGHTING AND BACKGROUND\nClean light-neutral seamless studio background, such as warm white or very pale beige. Soft diffused commercial studio lighting. Natural shadows only. Accurate flower and wrapping colours.",
    // 9
    "PHOTOGRAPHIC STYLE\nHigh-end florist catalog photography, photorealistic, refined, elegant, commercially usable, sharp flower detail, realistic petals, realistic paper texture, realistic ribbon, balanced depth of field.",
    // 10
    "HARD EXCLUSIONS\nNo person. No hands. No fingers. No arms. No face. No body. No human silhouette. No vase. No table styling. No room. No shop interior. No outdoor scene. No lifestyle scene. No text. No logo. No watermark. No gift card. No extra bouquet. No loose detached flowers. No unselected flower variety. No hidden wrapping. No missing ribbon. No cropped bouquet.",
    // 11
    "FINAL VALIDATION CHECKLIST\nBefore producing the image, verify that it contains:\n" +
      "- Exactly one bouquet\n" +
      `- Only allowlisted flowers (${allowlistNames})\n` +
      "- Requested proportions represented as closely as possible\n" +
      "- Full rounded florist composition\n" +
      "- Entire wrapping visible\n" +
      "- Every selected wrap colour visibly represented\n" +
      "- Ribbon clearly visible\n" +
      "- Entire bouquet inside the frame\n" +
      "- Neutral studio background\n" +
      "- Absolutely no human presence",
  ];

  return { prompt: sections.join("\n\n"), allocation };
}
