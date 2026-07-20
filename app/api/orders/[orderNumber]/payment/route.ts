import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Marks an order's payment as complete, moving PENDING_PAYMENT -> CONFIRMED.
//
// This is intentionally a STUB. In production the caller is not the buyer:
//   - Whish Money: a payment webhook (verify its signature) or an admin action
//     confirming funds were received.
//   - Cash on Delivery: the courier app marking cash collected on delivery.
// TODO: when card/Stripe is added, a Stripe webhook (payment_intent.succeeded)
//       would call into this same transition after verifying the event signature.
//
// Guard: if PAYMENT_WEBHOOK_SECRET is set, require a matching bearer token so the
// endpoint can't be triggered by just anyone. Left open only when unset (local dev).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
  }

  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.status === "CONFIRMED") {
    // Idempotent: a webhook may fire more than once.
    return NextResponse.json({ orderNumber, status: order.status });
  }

  const updated = await prisma.order.update({
    where: { orderNumber },
    data: { status: "CONFIRMED" },
    select: { orderNumber: true, status: true },
  });

  return NextResponse.json(updated);
}
