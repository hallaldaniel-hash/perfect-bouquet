import Link from "next/link";
import { notFound } from "next/navigation";
import { getGiftById } from "@/lib/gifts";
import { LoveNoteCard } from "@/components/LoveNoteCard";
import { LocalTime } from "@/components/LocalTime";
import "../../quiz/quiz.css";
import "./gifts.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gift = await getGiftById(id);
  return {
    title: gift ? `A bouquet for ${gift.recipientName} | The Perfect Bouquet` : "The Perfect Bouquet",
    description: "Your bouquet is on its way.",
  };
}

export default async function GiftConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gift = await getGiftById(id);
  if (!gift) notFound();

  const isScheduled = gift.status === "SCHEDULED";
  const isSent = gift.status === "SENT";

  let heroKicker: string;
  let heroTitleLead: string;
  let heroTitleEm: string;
  if (isSent) {
    heroKicker = "Delivered";
    heroTitleLead = "It's in their";
    heroTitleEm = "inbox.";
  } else if (isScheduled) {
    heroKicker = "On its way";
    heroTitleLead = "It's ready to";
    heroTitleEm = "bloom.";
  } else {
    heroKicker = gift.status === "CANCELED" ? "Canceled" : "Something went wrong";
    heroTitleLead = "This bouquet";
    heroTitleEm = gift.status === "CANCELED" ? "was canceled." : "didn't send.";
  }

  return (
    <main className="builder-page gift-page">
      <header className="builder-header">
        <Link className="builder-brand" href="/" aria-label="Back to the beginning">
          <span>p</span><span>✿</span><span>b</span>
        </Link>
        <div>
          <p>THE PERFECT BOUQUET</p>
          <span>made with love, sent with feeling</span>
        </div>
        <Link className="back-link" href="/">← Home</Link>
      </header>

      <section className="gift-hero">
        <p className={`step-kicker gift-status-kicker ${gift.status.toLowerCase()}`}>{heroKicker}</p>
        <h1>{heroTitleLead} <em>{heroTitleEm}</em></h1>
        {isScheduled && (
          <p className="gift-lede">
            Your bouquet is scheduled to bloom in {gift.recipientName}&apos;s inbox on{" "}
            <strong><LocalTime iso={gift.scheduledAt} /></strong>. We&apos;ll take it from here.
          </p>
        )}
        {isSent && (
          <p className="gift-lede">
            Sent to {gift.recipientName} on{" "}
            <strong><LocalTime iso={gift.sentAt ?? gift.scheduledAt} /></strong>. We hope it made them smile.
          </p>
        )}
      </section>

      <div className="gift-grid">
        <div className="gift-visual">
          <div className="ai-bouquet-frame">
            {/* Served from our own endpoint so it works everywhere, including email. */}
            <img src={`/api/gifts/${gift.id}/image`} alt={`A ${gift.bouquet.stemCount}-flower bouquet for ${gift.recipientName}`} />
            <span className="ai-bouquet-label">their one-of-a-kind bouquet</span>
          </div>
        </div>

        <aside className="gift-details">
          <section className="confirm-block">
            <div className="section-heading"><div><span>01</span><h2>The bouquet</h2></div></div>
            <dl className="detail-list">
              <div><dt>Flowers</dt><dd>{gift.bouquet.flowers.map((f) => `${f.stemCount} × ${f.name}`).join(", ")}</dd></div>
              <div><dt>Wrap</dt><dd>{gift.bouquet.wraps.map((w) => w.name).join(" & ")}</dd></div>
              <div><dt>Stems</dt><dd>{gift.bouquet.stemCount}</dd></div>
            </dl>
          </section>
          <section className="confirm-block">
            <div className="section-heading"><div><span>02</span><h2>The send</h2></div></div>
            <dl className="detail-list">
              <div><dt>To</dt><dd>{gift.recipientName} · {gift.recipientEmail}</dd></div>
              <div><dt>From</dt><dd>{gift.senderName} · {gift.senderEmail}</dd></div>
              <div>
                <dt>{isSent ? "Sent" : "Arrives"}</dt>
                <dd><LocalTime iso={isSent ? (gift.sentAt ?? gift.scheduledAt) : gift.scheduledAt} /></dd>
              </div>
            </dl>
          </section>
          <div className="gift-note-preview">
            <LoveNoteCard
              recipientName={gift.recipientName}
              message={gift.message}
              fromName={gift.fromName}
            />
          </div>
        </aside>
      </div>

      <div className="gift-cta-row">
        <Link className="checkout-cta gift-again-cta" href="/quiz">
          <span>Make another bouquet</span><b aria-hidden="true">→</b>
        </Link>
        <p className="gift-fine">A confirmation is on its way to {gift.senderEmail}.</p>
      </div>
    </main>
  );
}
