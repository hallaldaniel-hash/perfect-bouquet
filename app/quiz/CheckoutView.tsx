"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LoveNoteCard } from "@/components/LoveNoteCard";
import { allocateStems, formatCents } from "@/lib/pricing";
import { TIME_SLOTS, PAYMENT_METHODS, type PaymentMethod } from "@/lib/orderOptions";

export interface CheckoutFlower {
  id: string;
  name: string;
  pricePerStem: number;
}

export interface CheckoutWrap {
  id: string;
  name: string;
  color: string;
  priceModifier: number;
}

export interface CheckoutBouquet {
  stemCount: number;
  flowers: CheckoutFlower[];
  wraps: CheckoutWrap[];
  subtotalCents: number;
  imageUrl: string | null;
  giftNote: { recipientName: string; message: string; fromName: string };
}

interface CheckoutViewProps {
  bouquet: CheckoutBouquet;
  onBack: () => void;
}

function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function CheckoutView({ bouquet, onBack }: CheckoutViewProps) {
  const { stemCount, flowers, wraps, subtotalCents, imageUrl, giftNote } = bouquet;

  const [recipientName, setRecipientName] = useState(giftNote.recipientName);
  const [recipientPhone, setRecipientPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const minDate = todayIso();

  // Per-flower stem allocation, for the summary line items.
  const allocation = useMemo(
    () => allocateStems(stemCount, flowers.length),
    [stemCount, flowers.length],
  );

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!recipientName.trim()) next.recipientName = "Who is receiving the flowers?";
    if (recipientPhone.replace(/\D/g, "").length < 6) next.recipientPhone = "Add a phone number for delivery.";
    if (!deliveryAddress.trim()) next.deliveryAddress = "Where should we bring them?";
    if (!deliveryDate) next.deliveryDate = "Pick a delivery day.";
    else if (deliveryDate < minDate) next.deliveryDate = "Choose today or a later date.";
    if (!(TIME_SLOTS as readonly string[]).includes(deliveryTimeSlot)) next.deliveryTimeSlot = "Choose a time window.";
    if (!buyerName.trim()) next.buyerName = "Tell us your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim())) next.buyerEmail = "Enter a valid email.";
    if (buyerPhone.replace(/\D/g, "").length < 6) next.buyerPhone = "Add a contact number.";
    if (!paymentMethod) next.paymentMethod = "Choose how you'd like to pay.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function placeOrder() {
    setSubmitError("");
    if (!validate()) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bouquet: {
            stemCount,
            flowerIds: flowers.map((flower) => flower.id),
            wrapIds: wraps.map((wrap) => wrap.id),
          },
          giftNote: {
            recipientName: giftNote.recipientName,
            message: giftNote.message,
            fromName: giftNote.fromName,
          },
          delivery: {
            recipientName,
            recipientPhone,
            address: deliveryAddress,
            date: deliveryDate,
            timeSlot: deliveryTimeSlot,
          },
          buyer: { name: buyerName, email: buyerEmail, phone: buyerPhone },
          paymentMethod,
        }),
      });

      if (!response.ok) {
        let message = "We couldn't place your order just yet. Please try again.";
        try {
          const parsed = (await response.json()) as { error?: unknown };
          if (typeof parsed.error === "string") message = parsed.error;
        } catch {
          /* keep default message */
        }
        throw new Error(message);
      }

      const { orderNumber } = (await response.json()) as { orderNumber: string };
      window.location.href = `/orders/${orderNumber}`;
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="builder-page checkout-page-shell">
      <header className="builder-header">
        <Link className="builder-brand" href="/" aria-label="Back to the beginning">
          <span>p</span><span>✿</span><span>b</span>
        </Link>
        <div>
          <p>THE PERFECT BOUQUET</p>
          <span>made with love, just for you</span>
        </div>
        <button type="button" className="back-link" onClick={onBack}>← Bouquet</button>
      </header>

      <section className="builder-intro checkout-intro">
        <p className="step-kicker">Almost in her hands</p>
        <h1>Where should it <em>bloom?</em></h1>
        <p>A few last details and your bouquet is on its way.</p>
      </section>

      <div className="checkout-grid">
        <div className="checkout-forms">
          <section className="checkout-block" aria-labelledby="delivery-title">
            <div className="section-heading">
              <div><span>01</span><h2 id="delivery-title">Delivery</h2></div>
            </div>
            <div className="field-stack">
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Recipient name</span>
                  <input type="text" className="field-input" value={recipientName} maxLength={80}
                    placeholder="Her name" onChange={(e) => setRecipientName(e.target.value)} />
                  {errors.recipientName && <span className="field-error">{errors.recipientName}</span>}
                </label>
                <label className="field">
                  <span className="field-label">Recipient phone</span>
                  <input type="tel" className="field-input" value={recipientPhone} maxLength={30}
                    placeholder="For the courier" onChange={(e) => setRecipientPhone(e.target.value)} />
                  {errors.recipientPhone && <span className="field-error">{errors.recipientPhone}</span>}
                </label>
              </div>
              <label className="field">
                <span className="field-label">Delivery address</span>
                <textarea className="field-textarea checkout-address" value={deliveryAddress} maxLength={280}
                  placeholder="Building, street, area, and any notes for finding the door"
                  onChange={(e) => setDeliveryAddress(e.target.value)} />
                {errors.deliveryAddress && <span className="field-error">{errors.deliveryAddress}</span>}
              </label>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Delivery date</span>
                  <input type="date" className="field-input" value={deliveryDate} min={minDate}
                    onChange={(e) => setDeliveryDate(e.target.value)} />
                  {errors.deliveryDate && <span className="field-error">{errors.deliveryDate}</span>}
                </label>
                <label className="field">
                  <span className="field-label">Time window</span>
                  <select className="field-select" value={deliveryTimeSlot}
                    onChange={(e) => setDeliveryTimeSlot(e.target.value)}>
                    <option value="" disabled>Choose a window</option>
                    {TIME_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                  {errors.deliveryTimeSlot && <span className="field-error">{errors.deliveryTimeSlot}</span>}
                </label>
              </div>
            </div>
          </section>

          <section className="checkout-block" aria-labelledby="buyer-title">
            <div className="section-heading">
              <div><span>02</span><h2 id="buyer-title">Your details</h2></div>
            </div>
            <div className="field-stack">
              <label className="field">
                <span className="field-label">Your name</span>
                <input type="text" className="field-input" value={buyerName} maxLength={80}
                  placeholder="So we know who to thank" onChange={(e) => setBuyerName(e.target.value)} />
                {errors.buyerName && <span className="field-error">{errors.buyerName}</span>}
              </label>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Email</span>
                  <input type="email" className="field-input" value={buyerEmail} maxLength={120}
                    placeholder="For your order confirmation" onChange={(e) => setBuyerEmail(e.target.value)} />
                  {errors.buyerEmail && <span className="field-error">{errors.buyerEmail}</span>}
                </label>
                <label className="field">
                  <span className="field-label">Phone</span>
                  <input type="tel" className="field-input" value={buyerPhone} maxLength={30}
                    placeholder="In case we need you" onChange={(e) => setBuyerPhone(e.target.value)} />
                  {errors.buyerPhone && <span className="field-error">{errors.buyerPhone}</span>}
                </label>
              </div>
            </div>
          </section>

          <section className="checkout-block" aria-labelledby="payment-title">
            <div className="section-heading">
              <div><span>03</span><h2 id="payment-title">Payment</h2></div>
            </div>
            <div className="pay-options">
              {PAYMENT_METHODS.map((method) => {
                const selected = paymentMethod === method.value;
                return (
                  <button type="button" key={method.value}
                    className={`pay-option ${selected ? "selected" : ""}`}
                    onClick={() => setPaymentMethod(method.value)} aria-pressed={selected}>
                    <span className="pay-mark" aria-hidden="true">{selected ? "✓" : ""}</span>
                    <strong>{method.label}</strong>
                    <small>{method.hint}</small>
                  </button>
                );
              })}
            </div>
            {errors.paymentMethod && <span className="field-error">{errors.paymentMethod}</span>}
            <p className="pay-note">You&apos;ll pay after we confirm your order — nothing is charged now.</p>
          </section>
        </div>

        <aside className="checkout-summary">
          <p className="summary-kicker">Your order</p>
          {imageUrl && (
            <div className="summary-image">
              <img src={imageUrl} alt={`Your ${stemCount}-flower bouquet`} />
            </div>
          )}
          <div className="summary-lines">
            {flowers.map((flower, index) => (
              <div className="summary-line" key={flower.id}>
                <span>{allocation[index]} × {flower.name}</span>
                <span>{formatCents(flower.pricePerStem * allocation[index])}</span>
              </div>
            ))}
            {wraps.map((wrap) => (
              <div className="summary-line summary-line-muted" key={wrap.id}>
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
            <output>{formatCents(subtotalCents)}</output>
          </div>
          <div className="summary-note">
            <LoveNoteCard
              recipientName={giftNote.recipientName}
              message={giftNote.message}
              fromName={giftNote.fromName}
              preview
            />
          </div>
          {submitError && <p className="generation-error" role="alert">{submitError}</p>}
          <button type="button" className="generate-button place-order-button" onClick={placeOrder} disabled={submitting}>
            <span>{submitting ? "Placing your order…" : "Place order"}</span>
            <b aria-hidden="true">{submitting ? "···" : "✿"}</b>
          </button>
          <p className="summary-fine">Subtotal shown before delivery. We&apos;ll confirm the final total with you.</p>
        </aside>
      </div>
    </main>
  );
}
