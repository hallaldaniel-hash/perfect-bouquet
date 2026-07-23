import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The bouquet-generation route reads the flower thumbnails from public/ via
  // fs at runtime (to send them to Cloudflare as reference images). Next.js
  // does not trace static public/ assets into a serverless function by default,
  // so declare them explicitly for this route or the reads would fail on Vercel
  // while working fine locally.
  outputFileTracingIncludes: {
    "/api/generate-bouquet": ["./public/flowers/thumbs/**"],
  },
};

export default nextConfig;
