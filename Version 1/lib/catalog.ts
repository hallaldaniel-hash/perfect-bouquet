import { prisma } from "@/lib/prisma";

// Shapes handed to the (client) builder. Only fields the UI/pricing need — no
// timestamps or internal flags leak to the browser.
export interface CatalogFlower {
  id: string;
  name: string;
  meaning: string;
  position: string;
  pricePerStem: number;
}

export interface CatalogWrap {
  id: string;
  name: string;
  color: string;
  priceModifier: number;
}

export interface Catalog {
  flowers: CatalogFlower[];
  wraps: CatalogWrap[];
}

/**
 * Load active flowers and wraps in their canonical order. Order matters: the
 * builder maps a flower's array index onto the atlas sprite cell and seeds its
 * default selections by index, so we always sort by sortOrder.
 */
export async function getCatalog(): Promise<Catalog> {
  const [flowers, wraps] = await Promise.all([
    prisma.flower.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        meaning: true,
        position: true,
        pricePerStem: true,
      },
    }),
    prisma.wrapColor.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        priceModifier: true,
      },
    }),
  ]);

  return { flowers, wraps };
}
