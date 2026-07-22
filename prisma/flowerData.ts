// Single source of truth for the flower catalog.
//
// Order is the reading order of public/flower-grid.png (8 columns x 6 rows), so
// the index doubles as the slice position AND the catalog sortOrder. Both
// scripts/slice-flowers.ts and prisma/seed.ts import this list — keep them in
// sync by only editing here.
//
// `slug` drives the image filename (public/flowers/<slug>.png). To swap in
// higher-quality artwork later, just replace that file — nothing else changes.

export type FlowerCategory = "main" | "decorative" | "filler" | "greenery";

export interface FlowerSeed {
  name: string;
  slug: string;
  meaning: string;
  category: FlowerCategory;
}

export const GRID_COLUMNS = 8;
export const GRID_ROWS = 6;

export const flowerCatalog: FlowerSeed[] = [
  // Row 1 — roses
  { name: "White Rose", slug: "white-rose", meaning: "purity", category: "main" },
  { name: "Pink Rose", slug: "pink-rose", meaning: "gratitude", category: "main" },
  { name: "Dark Red Rose", slug: "dark-red-rose", meaning: "deep love", category: "main" },
  { name: "Blush Rose", slug: "blush-rose", meaning: "tenderness", category: "main" },
  { name: "Yellow Rose", slug: "yellow-rose", meaning: "friendship", category: "main" },
  { name: "Orange Rose", slug: "orange-rose", meaning: "enthusiasm", category: "main" },
  { name: "Lavender Rose", slug: "lavender-rose", meaning: "enchantment", category: "main" },
  { name: "Spray Rose", slug: "spray-rose", meaning: "small joys", category: "main" },

  // Row 2
  { name: "Peony", slug: "peony", meaning: "happy love", category: "main" },
  { name: "Garden Rose", slug: "garden-rose", meaning: "devotion", category: "main" },
  { name: "Ranunculus", slug: "ranunculus", meaning: "radiance", category: "main" },
  { name: "Tulip", slug: "tulip", meaning: "affection", category: "main" },
  { name: "Lily", slug: "lily", meaning: "pure heart", category: "main" },
  { name: "Oriental Lily", slug: "oriental-lily", meaning: "abundance", category: "main" },
  { name: "Calla Lily", slug: "calla-lily", meaning: "grace", category: "main" },
  { name: "Cymbidium Orchid", slug: "cymbidium-orchid", meaning: "rare beauty", category: "main" },

  // Row 3
  { name: "Phalaenopsis Orchid", slug: "phalaenopsis-orchid", meaning: "elegance", category: "main" },
  { name: "Dendrobium Orchid", slug: "dendrobium-orchid", meaning: "refinement", category: "main" },
  { name: "Hydrangea", slug: "hydrangea", meaning: "heartfelt thanks", category: "main" },
  { name: "Carnation", slug: "carnation", meaning: "lasting bond", category: "main" },
  { name: "Lisianthus", slug: "lisianthus", meaning: "appreciation", category: "main" },
  { name: "Eustoma", slug: "eustoma", meaning: "calm", category: "main" },
  { name: "Alstroemeria", slug: "alstroemeria", meaning: "companionship", category: "main" },
  { name: "Gerbera Daisy", slug: "gerbera-daisy", meaning: "cheerfulness", category: "main" },

  // Row 4
  { name: "Sunflower", slug: "sunflower", meaning: "warmth", category: "main" },
  { name: "Baby's Breath", slug: "babys-breath", meaning: "everlasting love", category: "filler" },
  { name: "Statice", slug: "statice", meaning: "remembrance", category: "filler" },
  { name: "Waxflower", slug: "waxflower", meaning: "delicacy", category: "filler" },
  { name: "Hypericum", slug: "hypericum", meaning: "protection", category: "filler" },
  { name: "Sweet Pea", slug: "sweet-pea", meaning: "sweetness", category: "decorative" },
  { name: "Delphinium", slug: "delphinium", meaning: "big heart", category: "decorative" },
  { name: "Snapdragon", slug: "snapdragon", meaning: "strength", category: "decorative" },

  // Row 5
  { name: "Stock", slug: "stock", meaning: "contentment", category: "decorative" },
  { name: "Matthiola", slug: "matthiola", meaning: "quiet beauty", category: "decorative" },
  { name: "Chrysanthemum", slug: "chrysanthemum", meaning: "loyalty", category: "main" },
  { name: "Pompon Mum", slug: "pompon-mum", meaning: "playfulness", category: "main" },
  { name: "Daisy", slug: "daisy", meaning: "innocence", category: "main" },
  { name: "Aster", slug: "aster", meaning: "patience", category: "main" },
  { name: "Anemone", slug: "anemone", meaning: "anticipation", category: "main" },
  { name: "Protea", slug: "protea", meaning: "courage", category: "main" },

  // Row 6
  { name: "King Protea", slug: "king-protea", meaning: "bold heart", category: "main" },
  { name: "Leucadendron", slug: "leucadendron", meaning: "resilience", category: "decorative" },
  { name: "Eryngium", slug: "eryngium", meaning: "admiration", category: "decorative" },
  { name: "Heather", slug: "heather", meaning: "good fortune", category: "filler" },
  { name: "Solidago", slug: "solidago", meaning: "encouragement", category: "filler" },
  { name: "Ruscus", slug: "ruscus", meaning: "steadiness", category: "greenery" },
  { name: "Eucalyptus", slug: "eucalyptus", meaning: "renewal", category: "greenery" },
  { name: "Fern", slug: "fern", meaning: "sincerity", category: "greenery" },
];

/** Public path to a flower's image. Swap the file to swap the artwork. */
export function flowerImagePath(slug: string): string {
  return `/flowers/${slug}.png`;
}
