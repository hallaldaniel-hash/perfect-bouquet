import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByNumber } from "@/lib/orders";
import { LoveNoteCard } from "@/components/LoveNoteCard";
import { formatCents } from "@/lib/pricing";
import { PAYMENT_METHODS } from "@/lib/orderOptions";
import "../../quiz/quiz.css";
import "./orders.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  return {
    title: `Order ${orderNumber} | The Perfect Bouquet`,
    description: "Your bouquet order confirmation.",
  };
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();

  const isPending = order.status === "PENDING_PAYMENT";
  const paymentLabel =
    PAYMENT_METHODS.find((method) => method.value === order.paymentMethod)?.label ??
    order.paymentMethod;

  let paymentInstruction: string;
  if (!isPending) {
    paymentInstruction = "Payment received — your bouquet is on its way.";
  } else if (order.paymentMethod === "WHISH_MONEY") {
    paymentInstruction = `Send ${formatCents(order.subtotalCents)} via Whish Money and we'll confirm your bouquet right away.`;
  } else {
    paymentInstruction = `You'll pay ${formatCents(order.subtotalCents)} in cash when your bouquet arrives.`;
  }

  return (
    <main className="builder-page confirm-page">
      <header className="builder-header">
        <Link className="builder-brand" href="/" aria-label="Back to the beginning">
          <span>p</span><span>✿</span><span>b</span>
        </Link>
        <div>
          <p>THE PERFECT BOUQUET</p>
          <span>made with love, just for you</span>
        </div>
        <Link className="back-link" href="/">← Home</Link>
      </header>

      <section className="confirm-hero">
        <p className="step-kicker">Order {order.orderNumber}</p>
        <h1>She&apos;s going to <em>love it.</em></h1>
        <p className="confirm-lede">
          Thank you, {order.buyer.name.split(" ")[0]}. We&apos;ve received your order
          for {order.delivery.recipientName} and saved every petal of it.
        </p>
        <p className={`confirm-status ${isPending ? "pending" : "confirmed"}`}>
          <span className="status-dot" aria-hidden="true" />
          {isPending ? "Awaiting payment" : "Confirmed"}
        </p>
      </section>

      <div className="confirm-grid">
        <div className="confirm-details">
          <section className="confirm-block" aria-labelledby="delivery-summary">
            <div className="section-heading">
              <div><span>01</span><h2 id="delivery-summary">Delivery</h2></div>
            </div>
            <dl className="detail-list">
              <div><dt>To</dt><dd>{order.delivery.recipientName}</dd></div>
              <div><dt>Phone</dt><dd>{order.delivery.recipientPhone}</dd></div>
              <div><dt>Address</dt><dd>{order.delivery.address}</dd></div>
              <div><dt>Date</dt><dd>{formatDate(order.delivery.date)}</dd></div>
              <div><dt>Window</dt><dd>{order.delivery.timeSlot}</dd></div>
            </dl>
          </section>

          <section className="confirm-block" aria-labelledby="payment-summary">
            <div className="section-heading">
              <div><span>02</span><h2 id="payment-summary">Payment</h2></div>
            </div>
            <dl className="detail-list">
              <div><dt>Method</dt><dd>{paymentLabel}</dd></div>
              <div><dt>Status</dt><dd>{isPending ? "Pending payment" : "Confirmed"}</dd></div>
            </dl>
            <p className="payment-instruction">{paymentInstruction}</p>
          </section>

          <section className="confirm-block" aria-labelledby="buyer-summary">
            <div className="section-heading">
              <div><span>03</span><h2 id="buyer-summary">Ordered by</h2></div>
            </div>
            <dl className="detail-list">
              <div><dt>Name</dt><dd>{order.buyer.name}</dd></div>
              <div><dt>Email</dt><dd>{order.buyer.email}</dd></div>
              <div><dt>Phone</dt><dd>{order.buyer.phone}</dd></div>
            </dl>
          </section>
        </div>

        <aside className="confirm-summary">
          <p className="summary-kicker">Your bouquet · {order.bouquet.stemCount} stems</p>
          <div className="summary-lines">
            {order.bouquet.flowers.map((flower) => (
              <div className="summary-line" key={flower.name}>
                <span>{flower.stemCount} × {flower.name}</span>
                <span>{formatCents(flower.lineCents)}</span>
              </div>
            ))}
            {order.bouquet.wraps.map((wrap) => (
              <div className="summary-line summary-line-muted" key={wrap.name}>
                <span>
                  <i className="summary-swatch" style={{ backgroundColor: wrap.color }} aria-hidden="true" />
                  {wrap.name} wrap
                </span>
                <span>{wrap.priceModifier > 0 ? formatCents(wrap.priceModifier) : "—"}</span>
              </div>
            ))}
          </div>
          <div className="summary-total">
            <span>Subtotal</span>
            <output>{formatCents(order.subtotalCents)}</output>
          </div>
          <div className="summary-note">
            <LoveNoteCard
              recipientName={order.giftNote.recipientName}
              message={order.giftNote.message}
              fromName={order.giftNote.fromName}
            />
          </div>
        </aside>
      </div>

      <p className="confirm-fine">
        A copy of this confirmation is on its way to {order.buyer.email}. Questions? Just reply to that email.
      </p>
    </main>
  );
}
