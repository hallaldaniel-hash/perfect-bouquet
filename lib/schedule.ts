import { Client } from "@upstash/qstash";
import { getBaseUrl } from "@/lib/site";

// Schedule the delivery of a gift at a specific time using Upstash QStash.
// QStash calls our /api/gifts/deliver endpoint at (or just after) scheduledAt.
//
// Returns true if a delivery was scheduled. When QSTASH_TOKEN is not configured
// (e.g. local dev), returns false so the caller can decide how to proceed — the
// gift row is still created either way.
export async function scheduleGiftDelivery(
  giftId: string,
  scheduledAt: Date,
): Promise<boolean> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.warn(
      "QStash not configured (QSTASH_TOKEN missing) — gift saved but not auto-scheduled.",
    );
    return false;
  }

  const client = new Client({ token });
  const notBefore = Math.floor(scheduledAt.getTime() / 1000);

  await client.publishJSON({
    url: `${getBaseUrl()}/api/gifts/deliver`,
    body: { giftId },
    notBefore,
    // A few retries in case delivery hiccups; the endpoint is idempotent.
    retries: 3,
  });

  return true;
}
