import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allocateStems, isValidStemCount } from "@/lib/pricing";
import { scheduleGiftDelivery } from "@/lib/schedule";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMAGE_BYTES = 5_000_000;

function cleanRequired(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function dedupe(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === "string" && id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

// Parse a "data:image/jpeg;base64,...." URL into raw bytes + mime.
function parseImageDataUrl(value: unknown): { bytes: Buffer; mime: string } | null {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(value);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
    return { bytes, mime: match[1] };
  } catch {
    return null;
  }
}

interface GiftRequest {
  bouquet?: { stemCount?: unknown; flowerIds?: unknown; wrapIds?: unknown; imageData?: unknown };
  letter?: { message?: unknown; fromName?: unknown };
  send?: {
    recipientName?: unknown;
    recipientEmail?: unknown;
    senderName?: unknown;
    senderEmail?: unknown;
    scheduledAt?: unknown;
  };
}

export async function POST(request: NextRequest) {
  let payload: GiftRequest;
  try {
    payload = (await request.json()) as GiftRequest;
  } catch {
    return badRequest("We couldn't read your bouquet. Please try again.");
  }

  // --- Bouquet ---
  const stemCount = Number(payload.bouquet?.stemCount);
  if (!isValidStemCount(stemCount)) {
    return badRequest("Please pick an odd number of flowers, up to 29.");
  }
  const flowerIds = dedupe(payload.bouquet?.flowerIds);
  const wrapIds = dedupe(payload.bouquet?.wrapIds);
  if (flowerIds.length === 0) return badRequest("Please choose at least one flower.");
  if (wrapIds.length < 1 || wrapIds.length > 2) return badRequest("Please choose one or two wraps.");

  const image = parseImageDataUrl(payload.bouquet?.imageData);
  if (!image) return badRequest("The bouquet image is missing or too large. Please make it again.");

  // --- Letter ---
  const message = cleanRequired(payload.letter?.message, 600);
  if (!message) return badRequest("Please write a short message for the card.");
  // The card's signature comes from the note step; fall back to the sender name.
  const cardSignature = cleanRequired(payload.letter?.fromName, 80);

  // --- Send details ---
  const recipientName = cleanRequired(payload.send?.recipientName, 80);
  const recipientEmail = cleanRequired(payload.send?.recipientEmail, 120);
  const senderName = cleanRequired(payload.send?.senderName, 80);
  const senderEmail = cleanRequired(payload.send?.senderEmail, 120);
  if (!recipientName) return badRequest("Who is this bouquet for?");
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) return badRequest("Enter a valid recipient email.");
  if (!senderName) return badRequest("Please add your name.");
  if (!senderEmail || !EMAIL_RE.test(senderEmail)) return badRequest("Enter a valid email for yourself.");

  const scheduledRaw = typeof payload.send?.scheduledAt === "string" ? payload.send.scheduledAt : "";
  const scheduledAt = new Date(scheduledRaw);
  if (Number.isNaN(scheduledAt.getTime())) return badRequest("Please choose a valid send time.");
  // Allow a small grace window so "send now" (a few seconds out) is accepted.
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    return badRequest("Please choose a send time in the future.");
  }

  // --- Look up catalog rows, preserve submission order ---
  const [flowerRows, wrapRows] = await Promise.all([
    prisma.flower.findMany({ where: { id: { in: flowerIds }, active: true } }),
    prisma.wrapColor.findMany({ where: { id: { in: wrapIds }, active: true } }),
  ]);
  const flowerById = new Map(flowerRows.map((r) => [r.id, r]));
  const wrapById = new Map(wrapRows.map((r) => [r.id, r]));
  const orderedFlowers = flowerIds.map((id) => flowerById.get(id));
  const orderedWraps = wrapIds.map((id) => wrapById.get(id));
  if (orderedFlowers.some((r) => !r) || orderedWraps.some((r) => !r)) {
    return badRequest("Some flowers are no longer available. Please rebuild your bouquet.");
  }
  const flowers = orderedFlowers as NonNullable<(typeof orderedFlowers)[number]>[];
  const wraps = orderedWraps as NonNullable<(typeof orderedWraps)[number]>[];
  const allocation = allocateStems(stemCount, flowers.length);

  let giftId: string;
  try {
    const gift = await prisma.gift.create({
      data: {
        senderName,
        senderEmail: senderEmail.toLowerCase(),
        recipientName,
        recipientEmail: recipientEmail.toLowerCase(),
        message,
        fromName: cardSignature ?? senderName,
        stemCount,
        imageData: new Uint8Array(image.bytes),
        imageMime: image.mime,
        scheduledAt,
        status: "SCHEDULED",
        flowers: {
          create: flowers.map((flower, index) => ({
            flowerId: flower.id,
            stemCount: allocation[index],
          })),
        },
        wraps: {
          create: wraps.map((wrap, index) => ({
            wrapColorId: wrap.id,
            position: index,
          })),
        },
      },
      select: { id: true },
    });
    giftId = gift.id;
  } catch (error) {
    console.error("Gift creation failed", error);
    return NextResponse.json(
      { error: "We couldn't save your bouquet just now. Please try again." },
      { status: 500 },
    );
  }

  // Schedule delivery (best-effort — the gift is already saved). If QStash isn't
  // configured, the gift stays SCHEDULED and can be delivered manually.
  try {
    await scheduleGiftDelivery(giftId, scheduledAt);
  } catch (error) {
    console.error("Failed to schedule gift delivery", error);
  }

  return NextResponse.json({ id: giftId }, { status: 201 });
}
