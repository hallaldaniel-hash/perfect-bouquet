// Shared pricing + stem-allocation logic.
//
// This module is intentionally pure (no Prisma, no browser APIs) so the builder
// (client) and the order API (server) compute prices from the SAME source of
// truth. The client uses it for the live subtotal; the server re-runs it against
// DB prices when persisting an order, so client input is never trusted for money.

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
 * possible, giving the remainder to the earliest varieties. This is the exact
 * allocation the builder's canvas and the generate-bouquet API already use, so
 * per-flower pricing lines up with what the customer sees rendered.
 */
export function allocateStems(count: number, flowerCount: number): number[] {
  if (flowerCount <= 0) return [];
  const base = Math.floor(count / flowerCount);
  const remainder = count % flowerCount;
  return Array.from({ length: flowerCount }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}

export interface PricedFlower {
  pricePerStem: number;
}

export interface PricedWrap {
  priceModifier: number;
}

/**
 * Subtotal in cents = (each selected flower's per-stem price × its allocated
 * stems) + a flat priceModifier for each selected wrap color.
 */
export function computeSubtotalCents(
  count: number,
  selectedFlowers: PricedFlower[],
  selectedWraps: PricedWrap[],
): number {
  const allocation = allocateStems(count, selectedFlowers.length);
  const flowersCost = selectedFlowers.reduce(
    (sum, flower, index) => sum + flower.pricePerStem * allocation[index],
    0,
  );
  const wrapsCost = selectedWraps.reduce(
    (sum, wrap) => sum + wrap.priceModifier,
    0,
  );
  return flowersCost + wrapsCost;
}

/** Format integer cents as a currency string, e.g. 4250 -> "$42.50". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
