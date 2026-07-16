import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const recentRequests = new Map<string, number>();
const ALLOWED_FLOWERS = new Set([
  "Garden Rose",
  "Blush Peony",
  "Pink Tulip",
  "White Lily",
  "Ranunculus",
  "White Orchid",
  "Delphinium",
  "Sweet Pea",
  "Anemone",
  "Baby’s Breath",
]);

const ALLOWED_WRAPS = new Set([
  "Warm Ivory",
  "Blush Pink",
  "Botanical Olive",
  "Sage Green",
  "Dusty Blue",
  "Soft Lilac",
  "Champagne",
  "Deep Burgundy",
  "Natural Kraft",
  "Midnight",
]);

export async function POST(request: NextRequest) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: "The flower studio is not connected yet." },
      { status: 500 },
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const visitor = forwardedFor?.split(",")[0]?.trim() || "anonymous";
  const now = Date.now();
  const previousRequest = recentRequests.get(visitor) ?? 0;

  if (now - previousRequest < 20_000) {
    return NextResponse.json(
      { error: "Give the garden a few seconds before making another bouquet." },
      { status: 429 },
    );
  }

  let payload: { count?: number; flowers?: unknown; wraps?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid bouquet request." }, { status: 400 });
  }

  const count = Number(payload.count);
  const flowers = Array.isArray(payload.flowers)
    ? payload.flowers.filter((item): item is string => typeof item === "string" && ALLOWED_FLOWERS.has(item))
    : [];
  const wraps = Array.isArray(payload.wraps)
    ? payload.wraps.filter((item): item is string => typeof item === "string" && ALLOWED_WRAPS.has(item)).slice(0, 2)
    : [];

  if (!Number.isInteger(count) || count < 1 || count > 29 || count % 2 === 0 || flowers.length === 0 || wraps.length === 0) {
    return NextResponse.json({ error: "Please complete every bouquet choice." }, { status: 400 });
  }

  recentRequests.set(visitor, now);

  const flowerDescription = flowers.join(", ");
  const wrapDescription = wraps.join(" and ");
  const prompt = [
    "A single photorealistic luxury hand-tied anniversary bouquet, photographed by a high-end florist.",
    `Approximately ${count} visible flower blooms, using only these flower varieties: ${flowerDescription}.`,
    `The bouquet is elegantly wrapped in ${wrapDescription} florist paper with a delicate ivory silk ribbon.`,
    "Centered full bouquet with stems and wrapping visible, warm cream studio background, soft natural window light, romantic editorial product photography, realistic petals and foliage, refined and abundant composition, shallow depth of field, vertical portrait framing.",
    "No vase, no hands, no people, no text, no letters, no watermark, no extra objects.",
  ].join(" ");

  try {
    const cloudflareResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          steps: 8,
          seed: Math.floor(Math.random() * 2_147_483_647),
        }),
        cache: "no-store",
      },
    );

    const cloudflareData = await cloudflareResponse.json();
    const image = cloudflareData?.result?.image;

    if (!cloudflareResponse.ok || typeof image !== "string") {
      console.error("Cloudflare image generation failed", cloudflareResponse.status, cloudflareData?.errors);
      return NextResponse.json(
        { error: "The flowers need another moment to bloom. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { image: `data:image/jpeg;base64,${image}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Bouquet generation error", error);
    return NextResponse.json(
      { error: "The flowers need another moment to bloom. Please try again." },
      { status: 502 },
    );
  }
}
