import assert from "node:assert/strict";
import test from "node:test";

import {
  decodePalette,
  encodePalette,
  findNearDuplicate,
  moveColor,
  parseSavedColors,
  parseSessionSnapshot,
  reorderColors,
} from "../app/project-data.ts";

const recipe = [
  {
    key: "magenta",
    name: "Medium Magenta",
    role: "strong red-violet mixer",
    color: "#C9306F",
    amount: 18,
    ratio: 0.6,
    parts: 6,
  },
  {
    key: "yellow",
    name: "Yellow Medium",
    role: "warm primary",
    color: "#EFBD1F",
    amount: 12,
    ratio: 0.4,
    parts: 4,
  },
];

function savedColor(id, name, hex) {
  return {
    schemaVersion: 2,
    id,
    name,
    hex,
    cmyk: { c: 8, m: 72, y: 78, k: 4 },
    surface: "direct",
    paperHex: "#B28754",
    coats: 2,
    amountPerCoat: 15,
    totalMixAmount: 30,
    unit: "drops",
    correction: "too-dark",
    calibration: { cyan: 1, magenta: 1, yellow: 1, black: 1, white: 1 },
    recipe,
    createdAt: 123,
  };
}

test("migrates legacy palette colors without losing their CMYK values", () => {
  const parsed = parseSavedColors(
    JSON.stringify([{ id: "old", name: "Old red", hex: "#E14136", c: 8, m: 72, y: 78, k: 4 }]),
  );

  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].cmyk, { c: 8, m: 72, y: 78, k: 4 });
  assert.equal(parsed[0].surface, "direct");
  assert.equal(parsed[0].unit, "drops");
});

test("keeps complete recipes in shareable palette links", () => {
  const original = [savedColor("one", "Main headline", "#E14136")];
  const decoded = decodePalette(encodePalette(original));

  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].name, "Main headline");
  assert.equal(decoded[0].correction, "too-dark");
  assert.deepEqual(decoded[0].recipe, recipe);
  assert.equal(decoded[0].totalMixAmount, 30);
});

test("detects nearly identical colors but not clearly different ones", () => {
  const colors = [savedColor("one", "Main headline", "#E14136")];
  assert.equal(findNearDuplicate(colors, "#E24237")?.id, "one");
  assert.equal(findNearDuplicate(colors, "#245FC4"), null);
});

test("reorders palette colors by drag target or accessible arrow controls", () => {
  const colors = [
    savedColor("one", "One", "#E14136"),
    savedColor("two", "Two", "#EFC229"),
    savedColor("three", "Three", "#245FC4"),
  ];

  assert.deepEqual(
    reorderColors(colors, "three", "one").map((color) => color.id),
    ["three", "one", "two"],
  );
  assert.deepEqual(
    moveColor(colors, "two", 1).map((color) => color.id),
    ["one", "three", "two"],
  );
});

test("restores the current calculator session after a refresh", () => {
  const calibration = { cyan: 1, magenta: 1, yellow: 1, black: 1, white: 1 };
  const session = parseSessionSnapshot(
    JSON.stringify({
      cmyk: { c: 22, m: 44, y: 66, k: 8 },
      exactHex: "#C76F50",
      inputMode: "hex",
      surface: "white-base",
      paperHex: "#A97845",
      coats: 3,
      amountPerCoat: 24,
      unit: "drops",
      correction: "too-cool",
      customName: "Flower outline",
      calibration,
    }),
    calibration,
  );

  assert.ok(session);
  assert.equal(session.customName, "Flower outline");
  assert.equal(session.coats, 3);
  assert.equal(session.correction, "too-cool");
  assert.equal(session.paperHex, "#A97845");
});
