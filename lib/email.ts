import { Resend } from "resend";
import { getBaseUrl } from "@/lib/site";

// Lazily constructed so a missing RESEND_API_KEY never crashes import-time code.
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

// Resend's shared sandbox sender — works without verifying a custom domain.
// TODO: swap for a verified sender on your own domain for best deliverability.
const FROM_ADDRESS = "The Perfect Bouquet <onboarding@resend.dev>";

export interface GiftEmailData {
  id: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  message: string;
  fromName: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGiftEmailHtml(gift: GiftEmailData, imageUrl: string): string {
  const paragraphs = gift.message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:#4f5840;">${escapeHtml(line)}</p>`)
    .join("");

  const recipient = escapeHtml(gift.recipientName) || "you";
  const from = escapeHtml(gift.fromName) || escapeHtml(gift.senderName);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ece5d6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ece5d6;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#f4efe5;border:1px solid rgba(79,88,64,0.18);">
          <tr><td style="padding:34px 40px 8px;text-align:center;">
            <p style="margin:0;color:#788064;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">The Perfect Bouquet</p>
          </td></tr>
          <tr><td style="padding:8px 40px 0;text-align:center;">
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:34px;line-height:1.1;color:#39422f;">A bouquet for <span style="color:#c58f88;font-style:italic;">${recipient}</span></h1>
          </td></tr>
          <tr><td style="padding:24px 32px 8px;">
            <img src="${imageUrl}" alt="A bouquet for ${recipient}" width="496" style="display:block;width:100%;max-width:496px;border-radius:2px;" />
          </td></tr>
          <tr><td style="padding:14px 40px 34px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid rgba(79,88,64,0.16);">
              <tr><td style="padding:32px 34px;">
                <p style="margin:0 0 22px;color:#aa817b;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">a note from ${from}</p>
                <p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:#4f5840;">Dear ${recipient},</p>
                ${paragraphs}
                <p style="margin:24px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#4f5840;">Yours truly,<br/><span style="color:#c58f88;font-size:22px;font-style:italic;">${from}</span> <span style="color:#c58f88;">&#9829;</span></p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:0 40px 36px;text-align:center;">
            <p style="margin:0;color:#788064;font-size:12px;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">Sent with love by ${escapeHtml(gift.senderName)}.<br/>Just reply to this email to say thank you.</p>
          </td></tr>
        </table>
        <p style="margin:20px 0 0;color:#9aa08c;font-size:11px;font-family:Helvetica,Arial,sans-serif;">Made at The Perfect Bouquet — a little garden, for anyone.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderGiftEmailText(gift: GiftEmailData): string {
  const recipient = gift.recipientName || "you";
  const from = gift.fromName || gift.senderName;
  return `A bouquet for ${recipient}

a note from ${from}

Dear ${recipient},
${gift.message}

Yours truly,
${from}

Sent with love by ${gift.senderName}. Reply to this email to say thank you.
— The Perfect Bouquet`;
}

/**
 * Deliver the bouquet email to the recipient. The bouquet image is served from
 * our own /api/gifts/[id]/image endpoint (email clients render hosted https
 * images reliably). Throws on failure so the caller can mark the gift FAILED.
 */
export async function sendGiftEmail(gift: GiftEmailData): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("Email is not configured (RESEND_API_KEY missing).");
  }

  const imageUrl = `${getBaseUrl()}/api/gifts/${gift.id}/image`;
  const subject = `${gift.senderName} sent you a bouquet \u{1F490}`;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: gift.recipientEmail,
    replyTo: gift.senderEmail,
    subject,
    html: renderGiftEmailHtml(gift, imageUrl),
    text: renderGiftEmailText(gift),
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message ?? "unknown error"}`);
  }
}
