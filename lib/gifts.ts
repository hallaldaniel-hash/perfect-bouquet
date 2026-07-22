import { prisma } from "@/lib/prisma";

export type GiftStatus = "SCHEDULED" | "SENT" | "FAILED" | "CANCELED";

// Shaped gift for the sender-facing confirmation page (no image bytes).
export interface GiftDetail {
  id: string;
  status: GiftStatus;
  scheduledAt: string;
  sentAt: string | null;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  message: string;
  fromName: string;
  bouquet: {
    stemCount: number;
    flowers: { name: string; stemCount: number }[];
    wraps: { name: string; color: string }[];
  };
}

export async function getGiftById(id: string): Promise<GiftDetail | null> {
  const gift = await prisma.gift.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      recipientName: true,
      recipientEmail: true,
      senderName: true,
      senderEmail: true,
      message: true,
      fromName: true,
      stemCount: true,
      flowers: {
        select: { stemCount: true, flower: { select: { name: true } } },
      },
      wraps: {
        orderBy: { position: "asc" },
        select: { wrapColor: { select: { name: true, color: true } } },
      },
    },
  });

  if (!gift) return null;

  return {
    id: gift.id,
    status: gift.status,
    scheduledAt: gift.scheduledAt.toISOString(),
    sentAt: gift.sentAt ? gift.sentAt.toISOString() : null,
    recipientName: gift.recipientName,
    recipientEmail: gift.recipientEmail,
    senderName: gift.senderName,
    senderEmail: gift.senderEmail,
    message: gift.message,
    fromName: gift.fromName,
    bouquet: {
      stemCount: gift.stemCount,
      flowers: gift.flowers.map((item) => ({
        name: item.flower.name,
        stemCount: item.stemCount,
      })),
      wraps: gift.wraps.map((item) => ({
        name: item.wrapColor.name,
        color: item.wrapColor.color,
      })),
    },
  };
}
