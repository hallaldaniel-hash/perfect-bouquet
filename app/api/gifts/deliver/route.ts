import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { prisma } from "@/lib/prisma";
import { sendGiftEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/site";

export const runtime = "nodejs";

// Authenticate the caller. In production this is QStash (verified by signature).
// For manual/local delivery, an INTERNAL_DELIVER_SECRET bearer is also accepted.
async function isAuthorized(request: NextRequest, rawBody: string): Promise<boolean> {
  const internalSecret = process.env.INTERNAL_DELIVER_SECRET;
  if (internalSecret) {
    const header = request.headers.get("authorization");
    if (header === `Bearer ${internalSecret}`) return true;
  }

  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (signature && currentSigningKey && nextSigningKey) {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    try {
      await receiver.verify({
        signature,
        body: rawBody,
        url: `${getBaseUrl()}/api/gifts/deliver`,
      });
      return true;
    } catch (error) {
      console.error("QStash signature verification failed", error);
      return false;
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!(await isAuthorized(request, rawBody))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let giftId: string;
  try {
    const parsed = JSON.parse(rawBody) as { giftId?: unknown };
    if (typeof parsed.giftId !== "string" || !parsed.giftId) throw new Error("bad giftId");
    giftId = parsed.giftId;
  } catch {
    return NextResponse.json({ error: "Invalid delivery request." }, { status: 400 });
  }

  const gift = await prisma.gift.findUnique({
    where: { id: giftId },
    select: {
      id: true,
      status: true,
      recipientName: true,
      recipientEmail: true,
      senderName: true,
      senderEmail: true,
      message: true,
      fromName: true,
    },
  });

  if (!gift) {
    // Nothing to deliver; return 200 so QStash stops retrying.
    return NextResponse.json({ delivered: false, reason: "not found" });
  }
  if (gift.status !== "SCHEDULED") {
    // Already sent or canceled — idempotent no-op.
    return NextResponse.json({ delivered: false, reason: `status ${gift.status}` });
  }

  // Atomically claim the gift so a duplicate callback can't double-send.
  const claim = await prisma.gift.updateMany({
    where: { id: giftId, status: "SCHEDULED" },
    data: { status: "SENT", sentAt: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.json({ delivered: false, reason: "already claimed" });
  }

  try {
    await sendGiftEmail(gift);
  } catch (error) {
    // Revert so QStash can retry the delivery.
    await prisma.gift.updateMany({
      where: { id: giftId, status: "SENT" },
      data: { status: "SCHEDULED", sentAt: null },
    });
    console.error("Gift email delivery failed", error);
    return NextResponse.json({ error: "Delivery failed; will retry." }, { status: 500 });
  }

  return NextResponse.json({ delivered: true });
}
