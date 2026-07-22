import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Order matches the original hardcoded arrays in BouquetBuilder.tsx; the index
// becomes sortOrder and drives the atlas sprite cell, so do not reorder.
// Prices are placeholders in cents — adjust to real catalog pricing before launch.
const flowers = [
  { name: "Garden Rose", meaning: "devotion", position: "0% 0%", pricePerStem: 350 },
  { name: "Blush Peony", meaning: "happy love", position: "25% 0%", pricePerStem: 650 },
  { name: "Pink Tulip", meaning: "affection", position: "50% 0%", pricePerStem: 300 },
  { name: "White Lily", meaning: "pure love", position: "75% 0%", pricePerStem: 400 },
  { name: "Ranunculus", meaning: "radiance", position: "100% 0%", pricePerStem: 500 },
  { name: "White Orchid", meaning: "rare beauty", position: "0% 100%", pricePerStem: 900 },
  { name: "Delphinium", meaning: "big heart", position: "25% 100%", pricePerStem: 350 },
  { name: "Sweet Pea", meaning: "sweetness", position: "50% 100%", pricePerStem: 300 },
  { name: "Anemone", meaning: "anticipation", position: "75% 100%", pricePerStem: 400 },
  { name: "Baby’s Breath", meaning: "everlasting love", position: "100% 100%", pricePerStem: 150 },
];

// priceModifier is a flat cents surcharge added once per bouquet for that wrap color.
const wraps = [
  { name: "Warm Ivory", color: "#eee5d6", priceModifier: 0 },
  { name: "Blush Pink", color: "#d9aca5", priceModifier: 0 },
  { name: "Botanical Olive", color: "#596348", priceModifier: 0 },
  { name: "Sage Green", color: "#9da88a", priceModifier: 0 },
  { name: "Dusty Blue", color: "#8fa6ad", priceModifier: 200 },
  { name: "Soft Lilac", color: "#b8a6c2", priceModifier: 200 },
  { name: "Champagne", color: "#cdbb94", priceModifier: 300 },
  { name: "Deep Burgundy", color: "#6d293a", priceModifier: 300 },
  { name: "Natural Kraft", color: "#ad865c", priceModifier: 0 },
  { name: "Midnight", color: "#28333a", priceModifier: 300 },
];

async function main() {
  for (const [index, flower] of flowers.entries()) {
    const data = { ...flower, sortOrder: index };
    await prisma.flower.upsert({
      where: { name: flower.name },
      update: data,
      create: data,
    });
  }

  for (const [index, wrap] of wraps.entries()) {
    const data = { ...wrap, sortOrder: index };
    await prisma.wrapColor.upsert({
      where: { name: wrap.name },
      update: data,
      create: data,
    });
  }

  console.log(`Seeded ${flowers.length} flowers and ${wraps.length} wrap colors.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
