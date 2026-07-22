import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Serves the stored bouquet image for a gift. Public by unguessable id (uuid),
// so it can be embedded in the delivered email and the confirmation page.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gift = await prisma.gift.findUnique({
    where: { id },
    select: { imageData: true, imageMime: true },
  });

  if (!gift) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = new Uint8Array(gift.imageData);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": gift.imageMime || "image/jpeg",
      "Content-Length": String(bytes.length),
      // Immutable — the image never changes for a given gift id.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
