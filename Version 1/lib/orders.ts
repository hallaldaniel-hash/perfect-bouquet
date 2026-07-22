import { prisma } from "@/lib/prisma";

// Shaped order detail returned to the confirmation page and the GET API. Only
// the fields those surfaces need — no internal ids beyond what's useful.
export interface OrderDetail {
  orderNumber: string;
  status: "PENDING_PAYMENT" | "CONFIRMED";
  paymentMethod: "WHISH_MONEY" | "CASH_ON_DELIVERY";
  subtotalCents: number;
  createdAt: string;
  delivery: {
    recipientName: string;
    recipientPhone: string;
    address: string;
    date: string;
    timeSlot: string;
  };
  buyer: { name: string; email: string; phone: string };
  giftNote: { recipientName: string; message: string; fromName: string };
  bouquet: {
    stemCount: number;
    flowers: { name: string; stemCount: number; lineCents: number }[];
    wraps: { name: string; color: string; priceModifier: number }[];
  };
}

export async function getOrderByNumber(
  orderNumber: string,
): Promise<OrderDetail | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      customer: true,
      bouquet: {
        include: {
          flowers: { include: { flower: true } },
          wraps: { include: { wrapColor: true }, orderBy: { position: "asc" } },
        },
      },
    },
  });

  if (!order || !order.bouquet) return null;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotalCents: order.subtotalCents,
    createdAt: order.createdAt.toISOString(),
    delivery: {
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      address: order.deliveryAddress,
      date: order.deliveryDate.toISOString().slice(0, 10),
      timeSlot: order.deliveryTimeSlot,
    },
    buyer: {
      name: order.customer.name,
      email: order.customer.email,
      phone: order.customer.phone,
    },
    giftNote: {
      recipientName: order.giftNoteRecipient,
      message: order.giftNoteMessage,
      fromName: order.giftNoteFrom,
    },
    bouquet: {
      stemCount: order.bouquet.stemCount,
      flowers: order.bouquet.flowers.map((item) => ({
        name: item.flower.name,
        stemCount: item.stemCount,
        lineCents: item.flower.pricePerStem * item.stemCount,
      })),
      wraps: order.bouquet.wraps.map((item) => ({
        name: item.wrapColor.name,
        color: item.wrapColor.color,
        priceModifier: item.wrapColor.priceModifier,
      })),
    },
  };
}
