import { NextRequest, NextResponse } from "next/server";
import { flowerCatalog } from "@/prisma/flowerData";
import { ReferenceImageError } from "@/lib/referenceImages";
import { assembleReferenceSet } from "@/lib/bouquetReferences";
import { buildBouquetPrompt } from "@/lib/bouquetPrompt";

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

  let referenceSet;
  try {
    // input_image_0 is the normalised blueprint; input_image_1.. are the
    // selected flowers' catalog images (one each, or a single board for >3
    // varieties). All are resolved from trusted catalog slugs and normalised
    // within Cloudflare's sub-512 limit. A bad blueprint throws here (-> 400);
    // a bad flower image degrades to blueprint-only without failing the request.
    referenceSet = await assembleReferenceSet({
      blueprintBytes: referenceBytes,
      selectedFlowers: flowers,
    });
  } catch (error) {
    if (error instanceof ReferenceImageError) {
      return NextResponse.json(
        { error: "The bouquet reference could not be prepared." },
        { status: 400 },
      );
    }
    throw error;
  }

  // The prompt is built from the SAME reference roles that were just assembled,
  // so every "Image N is ..." line matches the image actually attached below.
  const { prompt } = buildBouquetPrompt({
    stemCount: count,
    selectedFlowers: flowers,
    selectedWraps: wraps,
    wrapColors: WRAP_COLORS,
    roles: referenceSet.roles,
  });

  try {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", "1024");
    form.append("height", "1024");
    form.append("steps", "8");
    // Cloudflare requires each reference image field to be named EXACTLY
    // input_image_0 through input_image_3 (up to 4 references) — a differently
    // named field is not recognized as a reference image at all, which silently
    // turns this into a text-to-image-only request. input_image_0 is the
    // blueprint; the rest are flower identity references.
    // https://developers.cloudflare.com/changelog/post/2025-11-25-flux-2-dev-workers-ai/
    for (const image of referenceSet.images) {
      form.append(
        image.field,
        new Blob([new Uint8Array(image.bytes)], { type: "image/jpeg" }),
        image.filename,
      );
    }

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
