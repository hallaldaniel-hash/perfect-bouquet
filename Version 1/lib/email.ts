import { Resend } from "resend";
import { formatCents } from "@/lib/pricing";
import type { OrderDetail } from "@/lib/orders";

// Lazily constructed so a missing RESEND_API_KEY never crashes import-time code
// (e.g. local dev without email configured yet).
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

// Resend's shared sandbox sender — works without verifying a custom domain,
// and (unlike most providers' sandboxes) can send to any recipient.
const FROM_ADDRESS = "The Perfect Bouquet <onboarding@resend.dev>";

/**
 * Notify the florist that a new order came in. Best-effort: logs and swallows
 * any failure so a broken email never fails order creation — the order is
 * already committed to the database by the time this runs.
 */
export async function sendOrderNotificationEmail(order: OrderDetail): Promise<void> {
  const resend = getResendClient();
  const to = process.env.FLORIST_NOTIFICATION_EMAIL;

  if (!resend || !to) {
    console.warn(
      "Order notification email skipped — set RESEND_API_KEY and FLORIST_NOTIFICATION_EMAIL to enable it.",
    );
    return;
  }

  const flowerLines = order.bouquet.flowers
    .map((flower) => `  ${flower.stemCount} × ${flower.name} — ${formatCents(flower.lineCents)}`)
    .join("\n");
  const wrapLines = order.bouquet.wraps
    .map(
      (wrap) =>
        `  ${wrap.name}${wrap.priceModifier > 0 ? ` — ${formatCents(wrap.priceModifier)}` : ""}`,
    )
    .join("\n");

  const text = `New order: ${order.orderNumber}

DELIVERY
  Recipient: ${order.delivery.recipientName} (${order.delivery.recipientPhone})
  Address: ${order.delivery.address}
  Date: ${order.delivery.date}
  Window: ${order.delivery.timeSlot}

BOUQUET (${order.bouquet.stemCount} stems)
${flowerLines}
${wrapLines}
  Subtotal: ${formatCents(order.subtotalCents)}

GIFT NOTE (to ${order.giftNote.recipientName}, signed ${order.giftNote.fromName})
  ${order.giftNote.message}

PAYMENT
  Method: ${order.paymentMethod}
  Status: ${order.status}

ORDERED BY
  ${order.buyer.name} — ${order.buyer.email} — ${order.buyer.phone}
`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `New order ${order.orderNumber} — for ${order.delivery.recipientName}`,
      text,
    });
  } catch (error) {
    console.error("Failed to send order notification email", error);
  }
}
