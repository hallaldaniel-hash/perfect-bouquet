// Focused regression test for the input_image -> input_image_0 transport fix.
//
// Proves what the fix commit claims and nothing more: the outgoing Cloudflare
// multipart request carries the reference image under input_image_0, never
// under the old input_image name, and every other field (prompt text, blob
// bytes, MIME type, width/height/steps) is unchanged by the fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";

const REFERENCE_BYTES = Buffer.from("fake-blueprint-jpeg-bytes-for-test");
const REFERENCE_IMAGE = `data:image/jpeg;base64,${REFERENCE_BYTES.toString("base64")}`;

function cloudflareSuccessResponse() {
  const fakeResultImage = Buffer.from("fake-output-jpeg-bytes").toString("base64");
  return new Response(JSON.stringify({ result: { image: fakeResultImage } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("POST sends the reference image as input_image_0, not input_image, preserving every other field", async () => {
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
        referenceImage: REFERENCE_IMAGE,
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200);

    assert.ok(capturedForm, "expected the route to call fetch with a FormData body");
    const form = capturedForm as FormData;

    // The fix: new field name present, old field name gone entirely.
    assert.ok(form.has("input_image_0"), "expected input_image_0 field to be present");
    assert.ok(!form.has("input_image"), "expected the old input_image field to be absent");

    // Everything else must be untouched by the fix.
    assert.equal(form.get("width"), "1024");
    assert.equal(form.get("height"), "1024");
    assert.equal(form.get("steps"), "8");

    const prompt = form.get("prompt");
    assert.equal(typeof prompt, "string");
    assert.ok((prompt as string).includes("White Rose"));
    assert.ok((prompt as string).includes("Warm Ivory"));

    const uploadedFile = form.get("input_image_0") as File;
    assert.equal(uploadedFile.type, "image/jpeg");
    const uploadedBytes = Buffer.from(await uploadedFile.arrayBuffer());
    assert.deepEqual(uploadedBytes, REFERENCE_BYTES);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  }
});
