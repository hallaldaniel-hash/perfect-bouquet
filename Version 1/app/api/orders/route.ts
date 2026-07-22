import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  allocateStems,
  computeSubtotalCents,
  isValidStemCount,
} from "@/lib/pricing";
import {
  TIME_SLOTS,
  PAYMENT_METHOD_VALUES,
  type PaymentMethod,
} from "@/lib/orderOptions";
import { getOrderByNumber } from "@/lib/orders";
import { sendOrderNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";

// Trim + length-cap a required string field. Returns null if empty.
function cleanRequired(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function digitsCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface OrderRequest {
  bouquet?: { stemCount?: unknown; flowerIds?: unknown; wrapIds?: unknown };
  giftNote?: { recipientName?: unknown; message?: unknown; fromName?: unknown };
  delivery?: {
    recipientName?: unknown;
    recipientPhone?: unknown;
    address?: unknown;
    date?: unknown;
    timeSlot?: unknown;
  };
  buyer?: { name?: unknown; email?: unknown; phone?: unknown };
  paymentMethod?: unknown;
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** Preserve submission order while removing duplicate ids. */
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

export async function POST(request: NextRequest) {
  let payload: OrderRequest;
  try {
    payload = (await request.json()) as OrderRequest;
  } catch {
    return badRequest("We couldn't read your order. Please try again.");
  }

  // --- Bouquet ---
  const stemCount = Number(payload.bouquet?.stemCount);
  if (!isValidStemCount(stemCount)) {
    return badRequest("That stem count isn't available — please pick an odd number up to 29.");
  }

  const flowerIds = dedupe(payload.bouquet?.flowerIds);
  const wrapIds = dedupe(payload.bouquet?.wrapIds);
  if (flowerIds.length === 0) return badRequest("Please choose at least one flower.");
  if (wrapIds.length < 1 || wrapIds.length > 2) {
    return badRequest("Please choose one or two wrap colors.");
  }

  // --- Gift note ---
  const giftNoteRecipient = cleanRequired(payload.giftNote?.recipientName, 80);
  const giftNoteMessage = cleanRequired(payload.giftNote?.message, 600);
  const giftNoteFrom = cleanRequired(payload.giftNote?.fromName, 80);
  if (!giftNoteRecipient || !giftNoteMessage || !giftNoteFrom) {
    return badRequest("Please complete the gift note.");
  }

  // --- Delivery ---
  const recipientName = cleanRequired(payload.delivery?.recipientName, 80);
  const recipientPhone = cleanRequired(payload.delivery?.recipientPhone, 30);
  const deliveryAddress = cleanRequired(payload.delivery?.address, 280);
  const deliveryDateRaw = cleanRequired(payload.delivery?.date, 10);
  const deliveryTimeSlot = cleanRequired(payload.delivery?.timeSlot, 40);
  if (!recipientName || !deliveryAddress) {
    return badRequest("Please complete the delivery details.");
  }
  if (!recipientPhone || digitsCount(recipientPhone) < 6) {
    return badRequest("Please add a valid recipient phone number.");
  }
  if (!deliveryTimeSlot || !TIME_SLOTS.includes(deliveryTimeSlot as (typeof TIME_SLOTS)[number])) {
    return badRequest("Please choose a valid delivery time window.");
  }
  // Date must be a real yyyy-mm-dd and not in the past (compare date-only, UTC).
  if (!deliveryDateRaw || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDateRaw)) {
    return badRequest("Please choose a valid delivery date.");
  }
  const deliveryDate = new Date(`${deliveryDateRaw}T00:00:00.000Z`);
  if (Number.isNaN(deliveryDate.getTime())) {
    return badRequest("Please choose a valid delivery date.");
  }
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  if (deliveryDate < todayUtc) {
    return badRequest("Please choose today or a later delivery date.");
  }

  // --- Buyer ---
  const buyerName = cleanRequired(payload.buyer?.name, 80);
  const buyerEmailRaw = cleanRequired(payload.buyer?.email, 120);
  const buyerPhone = cleanRequired(payload.buyer?.phone, 30);
  if (!buyerName) return badRequest("Please tell us your name.");
  if (!buyerEmailRaw || !EMAIL_RE.test(buyerEmailRaw)) {
    return badRequest("Please enter a valid email address.");
  }
  const buyerEmail = buyerEmailRaw.toLowerCase();
  if (!buyerPhone || digitsCount(buyerPhone) < 6) {
    return badRequest("Please add a valid contact phone number.");
  }

  // --- Payment ---
  const paymentMethod = payload.paymentMethod;
  if (
    typeof paymentMethod !== "string" ||
    !PAYMENT_METHOD_VALUES.includes(paymentMethod as PaymentMethod)
  ) {
    return badRequest("Please choose a payment method.");
  }

  // --- Look up catalog rows and reorder to match submission order ---
  const [flowerRows, wrapRows] = await Promise.all([
    prisma.flower.findMany({ where: { id: { in: flowerIds }, active: true } }),
    prisma.wrapColor.findMany({ where: { id: { in: wrapIds }, active: true } }),
  ]);

  const flowerById = new Map(flowerRows.map((row) => [row.id, row]));
  const wrapById = new Map(wrapRows.map((row) => [row.id, row]));
  const orderedFlowers = flowerIds.map((id) => flowerById.get(id));
  const orderedWraps = wrapIds.map((id) => wrapById.get(id));
  if (orderedFlowers.some((row) => !row) || orderedWraps.some((row) => !row)) {
    return badRequest("Some of your choices are no longer available. Please rebuild your bouquet.");
  }
  const flowers = orderedFlowers as NonNullable<(typeof orderedFlowers)[number]>[];
  const wraps = orderedWraps as NonNullable<(typeof orderedWraps)[number]>[];

  // --- Server-authoritative pricing (client price is never trusted) ---
  const allocation = allocateStems(stemCount, flowers.length);
  const subtotalCents = computeSubtotalCents(stemCount, flowers, wraps);

  try {
    const orderNumber = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { email: buyerEmail },
        update: { name: buyerName, phone: buyerPhone },
        create: { name: buyerName, email: buyerEmail, phone: buyerPhone },
      });

      // Create with a temporary unique orderNumber, then derive PB-#### from the
      // autoincrement id so numbers are unique and strictly incrementing.
      const order = await tx.order.create({
        data: {
          orderNumber: `TMP-${randomUUID()}`,
          customerId: customer.id,
          recipientName,
          recipientPhone,
          deliveryAddress,
          deliveryDate,
          deliveryTimeSlot,
          giftNoteRecipient,
          giftNoteMessage,
          giftNoteFrom,
          paymentMethod: paymentMethod as PaymentMethod,
          status: "PENDING_PAYMENT",
          subtotalCents,
        },
      });

      const finalNumber = `PB-${String(order.id).padStart(4, "0")}`;
      await tx.order.update({
        where: { id: order.id },
        data: { orderNumber: finalNumber },
      });

      const bouquet = await tx.bouquet.create({
        data: { orderId: order.id, stemCount },
      });

      await tx.bouquetFlower.createMany({
        data: flowers.map((flower, index) => ({
          bouquetId: bouquet.id,
          flowerId: flower.id,
          stemCount: allocation[index],
        })),
      });

      await tx.bouquetWrap.createMany({
        data: wraps.map((wrap, index) => ({
          bouquetId: bouquet.id,
          wrapColorId: wrap.id,
          position: index,
        })),
      });

      return finalNumber;
    });

    // The order is already committed at this point — an email hiccup must
    // never turn into an order-creation failure for the buyer.
    const orderDetail = await getOrderByNumber(orderNumber);
    if (orderDetail) {
      await sendOrderNotificationEmail(orderDetail);
    }

    return NextResponse.json({ orderNumber, subtotalCents }, { status: 201 });
  } catch (error) {
    console.error("Order creation failed", error);
    return NextResponse.json(
      { error: "We couldn't place your order just now. Please try again." },
      { status: 500 },
    );
  }
}
