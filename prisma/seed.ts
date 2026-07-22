import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { flowerCatalog, flowerImagePath } from "./flowerData";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Wrap colors the bouquet can be dressed in.
const wraps = [
  { name: "Warm Ivory", color: "#eee5d6" },
  { name: "Blush Pink", color: "#d9aca5" },
  { name: "Botanical Olive", color: "#596348" },
  { name: "Sage Green", color: "#9da88a" },
  { name: "Dusty Blue", color: "#8fa6ad" },
  { name: "Soft Lilac", color: "#b8a6c2" },
  { name: "Champagne", color: "#cdbb94" },
  { name: "Deep Burgundy", color: "#6d293a" },
  { name: "Natural Kraft", color: "#ad865c" },
  { name: "Midnight", color: "#28333a" },
];

async function main() {
  // Flowers come from prisma/flowerData.ts, the same list the slicing script
  // uses, so names, categories and image files can never drift apart.
  for (const [index, flower] of flowerCatalog.entries()) {
    const data = {
      name: flower.name,
      meaning: flower.meaning,
      category: flower.category,
      image: flowerImagePath(flower.slug),
      sortOrder: index,
    };
    await prisma.flower.upsert({
      where: { name: flower.name },
      update: data,
      create: data,
    });
  }

  // Anything no longer in the catalog (e.g. the old 10-flower set) is retired
  // rather than deleted, so past gifts that reference it still resolve.
  const names = flowerCatalog.map((flower) => flower.name);
  const retired = await prisma.flower.updateMany({
    where: { name: { notIn: names }, active: true },
    data: { active: false },
  });

  for (const [index, wrap] of wraps.entries()) {
    const data = { ...wrap, sortOrder: index };
    await prisma.wrapColor.upsert({
      where: { name: wrap.name },
      update: data,
      create: data,
    });
  }

  console.log(
    `Seeded ${flowerCatalog.length} flowers and ${wraps.length} wrap colors` +
      (retired.count ? `; retired ${retired.count} old flower(s).` : "."),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
