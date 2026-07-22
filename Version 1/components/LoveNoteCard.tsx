// Presentational only (no hooks/handlers) so it renders in both client
// components (the builder's live preview) and server components (the order
// confirmation page). Styling comes from the `.love-note` rules in quiz.css.

interface LoveNoteCardProps {
  recipientName: string;
  message: string;
  fromName: string;
  /** Show gentle placeholders while the buyer is still typing. */
  preview?: boolean;
}

export function LoveNoteCard({
  recipientName,
  message,
  fromName,
  preview = false,
}: LoveNoteCardProps) {
  const cleanedRecipient = recipientName.trim();
  const cleanedFrom = fromName.trim();
  const paragraphs = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <article className="love-note">
      <span className="note-label">
        a note from {cleanedFrom || (preview ? "you" : "")}
      </span>
      <span className="wax-heart" aria-hidden="true">♥</span>
      <p>Dear {cleanedRecipient || (preview ? "…" : "")},</p>
      {paragraphs.length > 0 ? (
        paragraphs.map((line, index) => <p key={index}>{line}</p>)
      ) : (
        <p className="love-note-placeholder">
          {preview ? "Your message will bloom here…" : ""}
        </p>
      )}
      <p className="signature">
        Yours truly,
        <br />
        <em>{cleanedFrom || (preview ? "…" : "")}</em> <span>♥</span>
      </p>
    </article>
  );
}
