// Regression test for the input_image -> input_image_0 transport fix, plus the
// server-side blueprint normalisation added alongside it.
//
// Proves: the outgoing Cloudflare multipart request carries the reference image
// under input_image_0 (never the old input_image name), the prompt/width/height/
// steps fields are intact, and the blueprint is normalised to a valid JPEG that
// is within Cloudflare's sub-512 reference-image limit before it is sent.

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { MAX_REFERENCE_DIMENSION } from "@/lib/generationConfig";

// A real JPEG larger than the reference limit, so the route must actually
// decode and downscale it — arbitrary bytes would be rejected by sharp.
async function makeBlueprintDataUrl(): Promise<string> {
  const bytes = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 240, g: 230, b: 220 } },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function cloudflareSuccessResponse() {
  const fakeResultImage = Buffer.from("fake-output-jpeg-bytes").toString("base64");
  return new Response(JSON.stringify({ result: { image: fakeResultImage } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("POST sends the blueprint as input_image_0, normalised within the reference limit, preserving every other field", async () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
  process.env.CLOUDFLARE_API_TOKEN = "test-token";

  const originalFetch = globalThis.fetch;
  let capturedForm: FormData | undefined;

  globalThis.fetch = (async (_url, init) => {
    capturedForm = init?.body as FormData;
    return cloudflareSuccessResponse();
  }) as typeof fetch;

  try {
    const request = new NextRequest("http://localhost/api/generate-bouquet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        count: 3,
        flowers: ["White Rose"],
        wraps: ["Warm Ivory"],
        referenceImage: await makeBlueprintDataUrl(),
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200);

    assert.ok(capturedForm, "expected the route to call fetch with a FormData body");
    const form = capturedForm as FormData;

    // The fix: new field name present, old field name gone entirely.
    assert.ok(form.has("input_image_0"), "expected input_image_0 field to be present");
    assert.ok(!form.has("input_image"), "expected the old input_image field to be absent");

    // Everything else must be untouched.
    assert.equal(form.get("width"), "1024");
    assert.equal(form.get("height"), "1024");
    assert.equal(form.get("steps"), "8");

    const prompt = form.get("prompt");
    assert.equal(typeof prompt, "string");
    assert.ok((prompt as string).includes("White Rose"));
    assert.ok((prompt as string).includes("Warm Ivory"));

    // The blueprint reaching Cloudflare must be a valid JPEG within the limit.
    const uploadedFile = form.get("input_image_0") as File;
    assert.equal(uploadedFile.type, "image/jpeg");
    const uploadedBytes = Buffer.from(await uploadedFile.arrayBuffer());
    const meta = await sharp(uploadedBytes).metadata();
    assert.equal(meta.format, "jpeg");
    assert.ok((meta.width ?? 0) <= MAX_REFERENCE_DIMENSION, "width within reference limit");
    assert.ok((meta.height ?? 0) <= MAX_REFERENCE_DIMENSION, "height within reference limit");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  }
});
