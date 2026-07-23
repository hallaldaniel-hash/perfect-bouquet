import { NextRequest, NextResponse } from "next/server";
import { flowerCatalog } from "@/prisma/flowerData";

export const runtime = "nodejs";
export const maxDuration = 300;

const recentRequests = new Map<string, number>();
// Built from the same catalog the database is seeded from, so adding a flower
// in one place can never leave this allowlist behind.
const ALLOWED_FLOWERS = new Set(flowerCatalog.map((flower) => flower.name));

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
const WRAP_COLORS: Record<string, string> = {
  "Warm Ivory": "#eee5d6",
  "Blush Pink": "#d9aca5",
  "Botanical Olive": "#596348",
  "Sage Green": "#9da88a",
  "Dusty Blue": "#8fa6ad",
  "Soft Lilac": "#b8a6c2",
  "Champagne": "#cdbb94",
  "Deep Burgundy": "#6d293a",
  "Natural Kraft": "#ad865c",
  "Midnight": "#28333a",
};

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

  let payload: { count?: number; flowers?: unknown; wraps?: unknown; referenceImage?: unknown };
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
  const referenceImage = typeof payload.referenceImage === "string" ? payload.referenceImage : "";

  if (!Number.isInteger(count) || count < 1 || count > 29 || count % 2 === 0 || flowers.length === 0 || wraps.length === 0 || !referenceImage.startsWith("data:image/jpeg;base64,")) {
    return NextResponse.json({ error: "Please complete every bouquet choice." }, { status: 400 });
  }

  const referenceBytes = Buffer.from(referenceImage.slice("data:image/jpeg;base64,".length), "base64");
  if (referenceBytes.length === 0 || referenceBytes.length > 3_000_000) {
    return NextResponse.json({ error: "The bouquet reference could not be prepared." }, { status: 400 });
  }

  recentRequests.set(visitor, now);

  const allocation = flowers.map((flower, index) => ({
    flower,
    count: Math.floor(count / flowers.length) + (index < count % flowers.length ? 1 : 0),
  }));
  const forbiddenFlowers = [...ALLOWED_FLOWERS].filter((flower) => !flowers.includes(flower));
  const wrapLayers = wraps.length === 1
    ? { outer: wraps[0], inner: wraps[0] }
    : { outer: wraps[1], inner: wraps[0] };

  const specification = {
    task: "Transform the supplied bouquet blueprint into one photorealistic florist product photograph. The reference image is a binding composition and color guide, not optional inspiration.",
    bouquet_inventory: {
      exact_total_visible_flower_units: count,
      exact_required_units: allocation,
      forbidden_flower_varieties: forbiddenFlowers,
      inventory_rule: "Use every required variety and no forbidden variety. Do not substitute common roses or peonies for another named variety. A delphinium, sweet pea, orchid, or baby's-breath unit may be a single flowering stem or cluster, exactly as depicted in the reference.",
    },
    bouquet_scale: {
      size: count <= 9 ? "small hand-tied bouquet" : count <= 19 ? "medium hand-tied bouquet" : "full but controlled hand-tied bouquet",
      rule: "Do not exaggerate the size, density, number of petals, or number of flowers. Leave visible breathing room between flower units. This is not an enormous bridal bouquet.",
    },
    wrapping: {
      inner_visible_layer: `${wrapLayers.inner} (${WRAP_COLORS[wrapLayers.inner]}) matching the inner wrap color in the reference`,
      outer_visible_layer: `${wrapLayers.outer} (${WRAP_COLORS[wrapLayers.outer]}) matching the outer wrap color in the reference`,
      rule: wraps.length === 2
        ? "Show two clearly distinct paper layers. Do not recolor, blend, replace, omit, or turn either wrapping color into a flower color."
        : "Use exactly one wrapping color. Do not introduce another colored wrapping layer.",
      ribbon: "one narrow ivory silk ribbon only",
    },
    visual_style: {
      medium: "high-end photorealistic florist product photography",
      composition: "one centered bouquet, full bouquet and wrapping visible, matching the supplied blueprint silhouette",
      background: "plain warm cream seamless studio background",
      lighting: "soft natural window light, realistic shadows, true botanical texture",
      framing: "vertical square crop with comfortable empty space around the bouquet",
    },
    absolute_prohibitions: [
      "no additional flowers",
      "no invented filler flowers",
      "no substitutions",
      "no oversized or overflowing bouquet",
      "no vase",
      "no hands or people",
      "no text, labels, letters, logos, or watermark",
      "no objects besides the bouquet, wrap, stems, minimal green foliage, and ribbon",
    ],
    final_check: `Before rendering, verify the inventory sums to exactly ${count}, every listed flower appears in its assigned quantity, every forbidden flower is absent, and the wrapping has the specified color layer or layers. Accuracy is more important than abundance.`,
  };

  const prompt = `STRICT REFERENCE-BASED IMAGE EDIT. Preserve the exact restrained bouquet blueprint and obey this JSON production specification:\n${JSON.stringify(specification)}`;

  try {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", "1024");
    form.append("height", "1024");
    form.append("steps", "8");
    // Cloudflare requires the reference image field to be named EXACTLY
    // input_image_0 (through input_image_3 for up to 4 references) — a
    // differently-named field is not recognized as a reference image at all,
    // which silently turns this into a text-to-image-only request.
    // https://developers.cloudflare.com/changelog/post/2025-11-25-flux-2-dev-workers-ai/
    form.append("input_image_0", new Blob([referenceBytes], { type: "image/jpeg" }), "bouquet-blueprint.jpg");

    const cloudflareResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-2-dev`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        body: form,
        cache: "no-store",
      },
    );

    const cloudflareRaw = await cloudflareResponse.text();
    let cloudflareData: {
      result?: { image?: unknown };
      errors?: unknown;
    } = {};

    try {
      cloudflareData = JSON.parse(cloudflareRaw);
    } catch {
      console.error(
        "Cloudflare returned a non-JSON response",
        cloudflareResponse.status,
        cloudflareRaw.slice(0, 300),
      );
      return NextResponse.json(
        { error: "The image studio did not answer correctly. Please try once more." },
        { status: 502 },
      );
    }

    const image = cloudflareData?.result?.image;

    if (!cloudflareResponse.ok || typeof image !== "string") {
      console.error("Cloudflare image generation failed", cloudflareResponse.status, cloudflareData?.errors);
      return NextResponse.json(
        { error: "The flowers need another moment to bloom. Please try again." },
        { status: 502 },
      );
    }

    const cleanImage = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    const imageBytes = Buffer.from(cleanImage, "base64");

    if (imageBytes.length === 0 || imageBytes.length > 4_300_000) {
      console.error("Generated bouquet image was outside the safe response size", imageBytes.length);
      return NextResponse.json(
        { error: "The bouquet image was too large to deliver. Please try once more." },
        { status: 502 },
      );
    }

    return new Response(new Uint8Array(imageBytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(imageBytes.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Bouquet generation error", error);
    return NextResponse.json(
      { error: "The flowers need another moment to bloom. Please try again." },
      { status: 502 },
    );
  }
}
