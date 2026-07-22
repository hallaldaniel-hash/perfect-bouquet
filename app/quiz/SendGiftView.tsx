"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LoveNoteCard } from "@/components/LoveNoteCard";
import { allocateStems } from "@/lib/pricing";

export interface GiftFlowerChoice {
  id: string;
  name: string;
}

export interface GiftWrapChoice {
  id: string;
  name: string;
  color: string;
}

export interface GiftBouquet {
  stemCount: number;
  flowers: GiftFlowerChoice[];
  wraps: GiftWrapChoice[];
  imageUrl: string | null; // in-memory blob, for on-screen preview
  imageData: string | null; // base64 data URL, uploaded and stored for the email
  letter: { recipientName: string; message: string; fromName: string };
}

interface SendGiftViewProps {
  bouquet: GiftBouquet;
  onBack: () => void;
}

// datetime-local value (local wall time) for `now + minutesAhead`, e.g. 2026-07-22T18:30
function localDatetimeValue(minutesAhead: number): string {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function SendGiftView({ bouquet, onBack }: SendGiftViewProps) {
  const { stemCount, flowers, wraps, imageUrl, imageData, letter } = bouquet;

  const [recipientName, setRecipientName] = useState(letter.recipientName);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState(letter.fromName);
  const [senderEmail, setSenderEmail] = useState("");
  const [sendMode, setSendMode] = useState<"now" | "schedule">("schedule");
  const [scheduledLocal, setScheduledLocal] = useState(localDatetimeValue(60));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const minDatetime = localDatetimeValue(1);
  const allocation = useMemo(
    () => allocateStems(stemCount, flowers.length),
    [stemCount, flowers.length],
  );

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!recipientName.trim()) next.recipientName = "Who is this for?";
    if (!EMAIL_RE.test(recipientEmail.trim())) next.recipientEmail = "Enter their email address.";
    if (!senderName.trim()) next.senderName = "Add your name.";
    if (!EMAIL_RE.test(senderEmail.trim())) next.senderEmail = "Enter your email address.";
    if (sendMode === "schedule") {
      if (!scheduledLocal) next.scheduledLocal = "Pick a date and time.";
      else if (new Date(scheduledLocal).getTime() <= Date.now()) {
        next.scheduledLocal = "Choose a time in the future.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function sendGift() {
    setSubmitError("");
    if (!validate()) return;
    if (!imageData) {
      setSubmitError("The bouquet image is missing — go back and make it once more.");
      return;
    }
    setSubmitting(true);

    // Local wall time -> UTC ISO. "Send now" schedules a moment from now.
    const scheduledAt =
      sendMode === "now"
        ? new Date(Date.now() + 15_000).toISOString()
        : new Date(scheduledLocal).toISOString();

    try {
      const response = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bouquet: {
            stemCount,
            flowerIds: flowers.map((f) => f.id),
            wrapIds: wraps.map((w) => w.id),
            imageData,
          },
          letter: {
            recipientName,
            message: letter.message,
            fromName: letter.fromName,
          },
          send: { recipientName, recipientEmail, senderName, senderEmail, scheduledAt },
        }),
      });

      if (!response.ok) {
        let message = "We couldn't schedule your bouquet just yet. Please try again.";
        try {
          const parsed = (await response.json()) as { error?: unknown };
          if (typeof parsed.error === "string") message = parsed.error;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }

      const { id } = (await response.json()) as { id: string };
      window.location.href = `/gifts/${id}`;
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
          <span>made with love, sent with feeling</span>
        </div>
        <button type="button" className="back-link" onClick={onBack}>← Bouquet</button>
      </header>

      <section className="builder-intro checkout-intro">
        <p className="step-kicker">The last, loveliest step</p>
        <h1>Send it to <em>someone.</em></h1>
        <p>Tell us who it&apos;s for and when it should arrive — we&apos;ll deliver it to their inbox at exactly the right moment.</p>
      </section>

      <div className="checkout-grid">
        <div className="checkout-forms">
          <section className="checkout-block" aria-labelledby="to-title">
            <div className="section-heading">
              <div><span>01</span><h2 id="to-title">To</h2></div>
            </div>
            <div className="field-stack">
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Their name</span>
                  <input type="text" className="field-input" value={recipientName} maxLength={80}
                    placeholder="Who is it for?" onChange={(e) => setRecipientName(e.target.value)} />
                  {errors.recipientName && <span className="field-error">{errors.recipientName}</span>}
                </label>
                <label className="field">
                  <span className="field-label">Their email</span>
                  <input type="email" className="field-input" value={recipientEmail} maxLength={120}
                    placeholder="where the bouquet will bloom" onChange={(e) => setRecipientEmail(e.target.value)} />
                  {errors.recipientEmail && <span className="field-error">{errors.recipientEmail}</span>}
                </label>
              </div>
            </div>
          </section>

          <section className="checkout-block" aria-labelledby="from-title">
            <div className="section-heading">
              <div><span>02</span><h2 id="from-title">From</h2></div>
            </div>
            <div className="field-stack">
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Your name</span>
                  <input type="text" className="field-input" value={senderName} maxLength={80}
                    placeholder="So they know it's from you" onChange={(e) => setSenderName(e.target.value)} />
                  {errors.senderName && <span className="field-error">{errors.senderName}</span>}
                </label>
                <label className="field">
                  <span className="field-label">Your email</span>
                  <input type="email" className="field-input" value={senderEmail} maxLength={120}
                    placeholder="for your confirmation" onChange={(e) => setSenderEmail(e.target.value)} />
                  {errors.senderEmail && <span className="field-error">{errors.senderEmail}</span>}
                </label>
              </div>
            </div>
          </section>

          <section className="checkout-block" aria-labelledby="when-title">
            <div className="section-heading">
              <div><span>03</span><h2 id="when-title">When</h2></div>
            </div>
            <div className="send-mode">
              <button type="button" className={`send-mode-option ${sendMode === "now" ? "selected" : ""}`}
                onClick={() => setSendMode("now")} aria-pressed={sendMode === "now"}>
                <strong>Right now</strong>
                <small>Send it to their inbox within a minute.</small>
              </button>
              <button type="button" className={`send-mode-option ${sendMode === "schedule" ? "selected" : ""}`}
                onClick={() => setSendMode("schedule")} aria-pressed={sendMode === "schedule"}>
                <strong>At the perfect moment</strong>
                <small>Pick the exact day and time it should arrive.</small>
              </button>
            </div>
            {sendMode === "schedule" && (
              <label className="field send-when-field">
                <span className="field-label">Deliver on</span>
                <input type="datetime-local" className="field-input" value={scheduledLocal} min={minDatetime}
                  onChange={(e) => setScheduledLocal(e.target.value)} />
                {errors.scheduledLocal && <span className="field-error">{errors.scheduledLocal}</span>}
                <span className="field-hint">In your local time · they&apos;ll receive it right on the dot</span>
              </label>
            )}
          </section>
        </div>

        <aside className="checkout-summary">
          <p className="summary-kicker">Your bouquet · {stemCount} stems</p>
          {imageUrl && (
            <div className="summary-image">
              <img src={imageUrl} alt={`Your ${stemCount}-flower bouquet`} />
            </div>
          )}
          <div className="summary-lines">
            {flowers.map((flower, index) => (
              <div className="summary-line" key={flower.id}>
                <span>{allocation[index]} × {flower.name}</span>
              </div>
            ))}
            {wraps.map((wrap) => (
              <div className="summary-line summary-line-muted" key={wrap.id}>
                <span>
                  <i className="summary-swatch" style={{ backgroundColor: wrap.color }} aria-hidden="true" />
                  {wrap.name} wrap
                </span>
              </div>
            ))}
          </div>
          <div className="summary-note">
            <LoveNoteCard
              recipientName={letter.recipientName}
              message={letter.message}
              fromName={letter.fromName}
              preview
            />
          </div>
          {submitError && <p className="generation-error" role="alert">{submitError}</p>}
          <button type="button" className="generate-button place-order-button" onClick={sendGift} disabled={submitting}>
            <span>{submitting ? "Sending your bouquet…" : sendMode === "now" ? "Send it now" : "Schedule the send"}</span>
            <b aria-hidden="true">{submitting ? "···" : "✿"}</b>
          </button>
          <p className="summary-fine">Free to send, always. We&apos;ll email you a confirmation.</p>
        </aside>
      </div>
    </main>
  );
}
