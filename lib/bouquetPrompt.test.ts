// Pure, no-I/O tests for the deterministic bouquet prompt. Reference roles are
// constructed directly so the prompt can be tested in isolation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBouquetPrompt, allocateStems, sanitizeText } from "./bouquetPrompt";
import type { ReferenceRole } from "./bouquetReferences";

const WRAP_COLORS: Record<string, string> = {
  "Warm Ivory": "#eee5d6",
  "Champagne": "#cdbb94",
  "Blush Pink": "#d9aca5",
  "Botanical Olive": "#596348",
};

function directRoles(flowers: string[]): ReferenceRole[] {
  return [
    { index: 0, field: "input_image_0", kind: "blueprint", flowers: [] },
    ...flowers.map((name, i) => ({
      index: i + 1,
      field: `input_image_${i + 1}`,
      kind: "flower" as const,
      flowers: [{ name, position: "" }],
    })),
  ];
}

function boardRoles(flowers: string[]): ReferenceRole[] {
  const positions = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center"];
  return [
    { index: 0, field: "input_image_0", kind: "blueprint", flowers: [] },
    {
      index: 1,
      field: "input_image_1",
      kind: "board",
      flowers: flowers.map((name, i) => ({ name, position: positions[i] })),
    },
  ];
}

test("is deterministic: identical input yields the identical string", () => {
  const input = {
    stemCount: 15,
    selectedFlowers: ["Garden Rose", "Ranunculus", "Anemone"],
    selectedWraps: ["Blush Pink", "Botanical Olive"],
    wrapColors: WRAP_COLORS,
    roles: directRoles(["Garden Rose", "Ranunculus", "Anemone"]),
  };
  assert.equal(buildBouquetPrompt(input).prompt, buildBouquetPrompt(input).prompt);
});

test("contains every selected flower name and its allocated quantity", () => {
  const { prompt, allocation } = buildBouquetPrompt({
    stemCount: 15,
    selectedFlowers: ["Garden Rose", "Ranunculus", "Anemone"],
    selectedWraps: ["Warm Ivory"],
    wrapColors: WRAP_COLORS,
    roles: directRoles(["Garden Rose", "Ranunculus", "Anemone"]),
  });
  // 15 across 3 -> 5/5/5.
  assert.deepEqual(allocation.map((a) => a.count), [5, 5, 5]);
  for (const a of allocation) {
    assert.ok(prompt.includes(a.flower), `prompt names ${a.flower}`);
    assert.ok(prompt.includes(`${a.flower}: approximately ${a.count} stems`), `prompt lists ${a.flower} quantity`);
  }
});

test("allowlist section lists only the selected varieties, one line each", () => {
  const selected = ["Garden Rose", "Anemone"];
  const { prompt } = buildBouquetPrompt({
    stemCount: 7,
    selectedFlowers: selected,
    selectedWraps: ["Warm Ivory"],
    wrapColors: WRAP_COLORS,
    roles: directRoles(selected),
  });
  const allowlistBlock = prompt.split("SELECTED FLOWER ALLOWLIST")[1].split("FLOWER QUANTITIES")[0];
  const bulletLines = allowlistBlock.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(bulletLines.length, selected.length);
  assert.ok(!prompt.includes("- Tulip:"), "an unselected variety must not appear as an allowlist entry");
});

test("maps each flower to the exact image index carrying it", () => {
  const selected = ["Garden Rose", "Ranunculus"];
  const { prompt } = buildBouquetPrompt({
    stemCount: 9,
    selectedFlowers: selected,
    selectedWraps: ["Warm Ivory"],
    wrapColors: WRAP_COLORS,
    roles: directRoles(selected),
  });
  assert.ok(prompt.includes("Image 1 is the identity reference for Garden Rose"));
  assert.ok(prompt.includes("Image 2 is the identity reference for Ranunculus"));
  assert.ok(prompt.includes("shown in Image 1"));
  assert.ok(prompt.includes("shown in Image 2"));
});

test("maps board tiles by grid position", () => {
  const selected = ["White Rose", "Pink Rose", "Tulip", "Peony", "Anemone"];
  const { prompt } = buildBouquetPrompt({
    stemCount: 15,
    selectedFlowers: selected,
    selectedWraps: ["Warm Ivory", "Champagne"],
    wrapColors: WRAP_COLORS,
    roles: boardRoles(selected),
  });
  assert.ok(prompt.includes("Image 1 is a reference board"));
  assert.ok(prompt.includes("the top-left tile of Image 1"));
  assert.ok(prompt.includes("the bottom-center tile of Image 1"));
});

test("falls back to name-only description when no flower references are present", () => {
  const selected = ["Garden Rose", "Ranunculus"];
  const { prompt } = buildBouquetPrompt({
    stemCount: 9,
    selectedFlowers: selected,
    selectedWraps: ["Warm Ivory"],
    wrapColors: WRAP_COLORS,
    roles: [{ index: 0, field: "input_image_0", kind: "blueprint", flowers: [] }],
  });
  assert.ok(prompt.includes("No individual flower reference images are provided"));
  assert.ok(prompt.includes("its botanical identity (no separate reference image)"));
});

test("one wrap and two wraps produce the correct wrapping instruction", () => {
  const one = buildBouquetPrompt({
    stemCount: 5, selectedFlowers: ["Garden Rose"], selectedWraps: ["Warm Ivory"],
    wrapColors: WRAP_COLORS, roles: directRoles(["Garden Rose"]),
  }).prompt;
  assert.ok(one.includes("Use exactly one wrapping colour: Warm Ivory (#eee5d6)"));
  assert.ok(!one.includes("two selected wrapping colours"));

  const two = buildBouquetPrompt({
    stemCount: 5, selectedFlowers: ["Garden Rose"], selectedWraps: ["Warm Ivory", "Champagne"],
    wrapColors: WRAP_COLORS, roles: directRoles(["Garden Rose"]),
  }).prompt;
  assert.ok(two.includes("Use exactly the two selected wrapping colours: Warm Ivory (#eee5d6) and Champagne (#cdbb94)"));
  assert.ok(two.includes("distinct, clearly separated visible layers"));
});

test("includes the human-presence and cropping hard exclusions", () => {
  const { prompt } = buildBouquetPrompt({
    stemCount: 5, selectedFlowers: ["Garden Rose"], selectedWraps: ["Warm Ivory"],
    wrapColors: WRAP_COLORS, roles: directRoles(["Garden Rose"]),
  });
  for (const clause of ["No person.", "No hands.", "No face.", "No vase.", "No text.", "No cropped bouquet."]) {
    assert.ok(prompt.includes(clause), `exclusion present: ${clause}`);
  }
});

test("emits all eleven sections in order", () => {
  const { prompt } = buildBouquetPrompt({
    stemCount: 5, selectedFlowers: ["Garden Rose"], selectedWraps: ["Warm Ivory"],
    wrapColors: WRAP_COLORS, roles: directRoles(["Garden Rose"]),
  });
  const headers = [
    "PRIMARY TASK", "REFERENCE IMAGE ROLES", "SELECTED FLOWER ALLOWLIST",
    "FLOWER QUANTITIES AND PROPORTIONS", "BOUQUET STRUCTURE", "WRAPPING AND RIBBON",
    "CAMERA AND FRAMING", "LIGHTING AND BACKGROUND", "PHOTOGRAPHIC STYLE",
    "HARD EXCLUSIONS", "FINAL VALIDATION CHECKLIST",
  ];
  let cursor = -1;
  for (const header of headers) {
    const at = prompt.indexOf(header);
    assert.ok(at > cursor, `${header} appears in order`);
    cursor = at;
  }
});

test("allocateStems gives the remainder to the earliest varieties, summing to the total", () => {
  const alloc = allocateStems(15, ["a", "b", "c", "d"]); // 15/4 -> 4,4,4,3
  assert.deepEqual(alloc.map((x) => x.count), [4, 4, 4, 3]);
  assert.equal(alloc.reduce((s, x) => s + x.count, 0), 15);
});

test("sanitizeText strips control characters and collapses whitespace", () => {
  assert.equal(sanitizeText("Rose\n{evil}\tstem"), "Rose evil stem");
  assert.equal(sanitizeText("Baby's Breath"), "Baby's Breath");
});
