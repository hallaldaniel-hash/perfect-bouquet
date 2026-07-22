/**
 * Absolute base URL of the app, used to build callback URLs (QStash) and
 * "view in browser" links. Prefers an explicit APP_URL, falls back to the
 * Vercel-provided deployment host, then localhost for dev.
 */
export function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
