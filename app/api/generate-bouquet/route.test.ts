// Integration tests for the generate-bouquet route's Cloudflare request
// construction. fetch is mocked and every call URL is captured, so the suite
// proves what is sent without making a single external request. Flower images
// are read from the real local catalog assets (a filesystem read, not a network
// call), exercising the true reference pipeline end to end.

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { MAX_REFERENCE_DIMENSION } from "@/lib/generationConfig";

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

interface RunResult {
  status: number;
  form?: FormData;
  fetchUrls: string[];
}

// The route keeps a 20s per-IP rate-limit map keyed on x-forwarded-for, so each
// test uses a distinct client IP to stay independent of the others.
let nextClientOctet = 1;

async function runRoute(body: Record<string, unknown>): Promise<RunResult> {
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
  process.env.CLOUDFLARE_API_TOKEN = "test-token";

  const originalFetch = globalThis.fetch;
  const fetchUrls: string[] = [];
  let form: FormData | undefined;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchUrls.push(String(url));
    form = init?.body as FormData;
    return cloudflareSuccessResponse();
  }) as typeof fetch;

  try {
    const request = new NextRequest("http://localhost/api/generate-bouquet", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${nextClientOctet++}` },
      body: JSON.stringify({ referenceImage: await makeBlueprintDataUrl(), ...body }),
    });
    const response = await POST(request);
    return { status: response.status, form, fetchUrls };
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  }
}

function imageFields(form: FormData): string[] {
  return [...form.keys()].filter((k) => k.startsWith("input_image")).sort();
}

async function assertJpegWithinLimit(file: File) {
  assert.equal(file.type, "image/jpeg");
  const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok((meta.width ?? 999) <= MAX_REFERENCE_DIMENSION);
  assert.ok((meta.height ?? 999) <= MAX_REFERENCE_DIMENSION);
}

test("blueprint is input_image_0, never the legacy input_image, and steps/width/height are unchanged", async () => {
  const { status, form } = await runRoute({ count: 3, flowers: ["White Rose"], wraps: ["Warm Ivory"] });
  assert.equal(status, 200);
  assert.ok(form);
  assert.ok(form!.has("input_image_0"));
  assert.ok(!form!.has("input_image"));
  assert.equal(form!.get("width"), "1024");
  assert.equal(form!.get("height"), "1024");
  assert.equal(form!.get("steps"), "8");
});

test("<=3 selected varieties attach one flower reference each; no unselected images", async () => {
  const { status, form } = await runRoute({
    count: 15,
    flowers: ["White Rose", "Pink Rose", "Tulip"],
    wraps: ["Warm Ivory", "Champagne"],
  });
  assert.equal(status, 200);
  // blueprint + exactly three flower references, in order, nothing more.
  assert.deepEqual(imageFields(form!), ["input_image_0", "input_image_1", "input_image_2", "input_image_3"]);
  for (const field of imageFields(form!)) {
    await assertJpegWithinLimit(form!.get(field) as File);
  }
  const prompt = form!.get("prompt") as string;
  // Prompt names every selected flower and its allocated quantity (15/3 = 5).
  for (const name of ["White Rose", "Pink Rose", "Tulip"]) {
    assert.ok(prompt.includes(`${name}: approximately 5 stems`), `${name} quantity in prompt`);
  }
  // The prompt's image-index mapping matches the attached fields.
  assert.ok(prompt.includes("Image 1 is the identity reference for White Rose"));
  assert.ok(prompt.includes("Image 3 is the identity reference for Tulip"));
});

test(">3 selected varieties collapse to a single reference board in input_image_1", async () => {
  const { status, form } = await runRoute({
    count: 15,
    flowers: ["White Rose", "Pink Rose", "Tulip", "Peony", "Anemone"],
    wraps: ["Warm Ivory"],
  });
  assert.equal(status, 200);
  assert.deepEqual(imageFields(form!), ["input_image_0", "input_image_1"]);
  await assertJpegWithinLimit(form!.get("input_image_1") as File);
  const prompt = form!.get("prompt") as string;
  assert.ok(prompt.includes("Image 1 is a reference board"));
  assert.ok(prompt.includes("the top-left tile of Image 1"));
});

test("the only outbound request is to Cloudflare — no other host is ever fetched", async () => {
  const { fetchUrls } = await runRoute({ count: 9, flowers: ["White Rose", "Pink Rose"], wraps: ["Warm Ivory"] });
  assert.equal(fetchUrls.length, 1);
  assert.ok(fetchUrls[0].startsWith("https://api.cloudflare.com/"), fetchUrls[0]);
});

test("a URL passed as a flower is rejected by the allowlist and never fetched", async () => {
  const { status, form, fetchUrls } = await runRoute({
    count: 5,
    flowers: ["White Rose", "https://169.254.169.254/latest/meta-data", "file:///etc/passwd"],
    wraps: ["Warm Ivory"],
  });
  assert.equal(status, 200);
  // Only the one valid catalog flower survives -> blueprint + 1 flower reference.
  assert.deepEqual(imageFields(form!), ["input_image_0", "input_image_1"]);
  // No request to the injected URL hosts; the sole fetch is Cloudflare.
  assert.equal(fetchUrls.length, 1);
  assert.ok(fetchUrls[0].startsWith("https://api.cloudflare.com/"));
  assert.ok(!fetchUrls.some((u) => u.includes("169.254.169.254") || u.startsWith("file:")));
});

test("an empty flower selection is rejected before any request", async () => {
  const { status, fetchUrls } = await runRoute({ count: 5, flowers: [], wraps: ["Warm Ivory"] });
  assert.equal(status, 400);
  assert.equal(fetchUrls.length, 0);
});
