// Stem-count validation + allocation.
//
// Pure module (no Prisma, no browser APIs) so the builder (client) and the gift
// API (server) share one source of truth. The platform is free, so there is no
// pricing here anymore — just the odd-count rule and how stems are split across
// the chosen flowers (which also drives the rendered bouquet).

export const MIN_STEMS = 1;
export const MAX_STEMS = 29;

/** Odd numbers only, within [MIN_STEMS, MAX_STEMS] — mirrors the range slider. */
export function isValidStemCount(count: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= MIN_STEMS &&
    count <= MAX_STEMS &&
    count % 2 === 1
  );
}

/**
 * Distribute `count` stems across `flowerCount` selected varieties as evenly as
 * possible, giving the remainder to the earliest varieties. Matches the builder
 * canvas and the generate-bouquet API so the summary lines up with what renders.
 */
export function allocateStems(count: number, flowerCount: number): number[] {
  if (flowerCount <= 0) return [];
  const base = Math.floor(count / flowerCount);
  const remainder = count % flowerCount;
  return Array.from({ length: flowerCount }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}
