import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CALIBRATION,
  allocateExactDrops,
  cmykToRgb,
  compositeOnPaper,
  getMatchQuality,
  getRecipeWeights,
  hexToRgb,
  rgbToCmyk,
  rgbToHex,
} from "../app/paint-logic.ts";

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function colorDistance(first, second) {
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
}

test("allocates whole drops that exactly match the requested batch", () => {
  const weights = getRecipeWeights(
    { c: 8, m: 72, y: 78, k: 4 },
    "direct",
    2,
    DEFAULT_CALIBRATION,
    0.5 / 60,
  );

  for (const requested of [1, 7, 30, 60, 101]) {
    const drops = allocateExactDrops(weights, requested);
    assert.equal(sum(drops.map((paint) => paint.amount)), requested);
    assert.ok(drops.every((paint) => Number.isInteger(paint.amount)));
    assert.ok(drops.every((paint) => paint.amount > 0));
  }
});

test("renormalizes the visible ingredients after tiny amounts are removed", () => {
  const recipe = getRecipeWeights(
    { c: 1, m: 80, y: 75, k: 0 },
    "white-base",
    1,
    DEFAULT_CALIBRATION,
    0.05,
  );

  assert.ok(recipe.every((paint) => paint.ratio >= 0.05));
  assert.ok(Math.abs(sum(recipe.map((paint) => paint.ratio)) - 1) < 1e-10);
  assert.ok(Math.abs(sum(recipe.map((paint) => paint.parts)) - 10) < 1e-10);
});

test("uses less paint when a pigment is calibrated as stronger", () => {
  const target = { c: 85, m: 18, y: 5, k: 0 };
  const starter = getRecipeWeights(target, "white-base", 1, DEFAULT_CALIBRATION);
  const stronger = getRecipeWeights(target, "white-base", 1, {
    ...DEFAULT_CALIBRATION,
    cyan: 1.15,
  });
  const starterCyan = starter.find((paint) => paint.key === "cyan");
  const strongerCyan = stronger.find((paint) => paint.key === "cyan");

  assert.ok(starterCyan);
  assert.ok(strongerCyan);
  assert.ok(strongerCyan.ratio < starterCyan.ratio);
});

test("builds dark neutrals from mixed color plus restrained black", () => {
  const recipe = getRecipeWeights(
    { c: 70, m: 70, y: 70, k: 0 },
    "white-base",
    1,
  );
  const keys = new Set(recipe.map((paint) => paint.key));

  assert.ok(keys.has("cyan"));
  assert.ok(keys.has("magenta"));
  assert.ok(keys.has("yellow"));
  assert.ok(keys.has("black"));
});

test("adds more coverage white for direct-to-paper mixes", () => {
  const target = { c: 20, m: 60, y: 55, k: 5 };
  const baseRecipe = getRecipeWeights(target, "white-base", 2);
  const directRecipe = getRecipeWeights(target, "direct", 2);
  const baseWhite = baseRecipe.find((paint) => paint.key === "white");
  const directWhite = directRecipe.find((paint) => paint.key === "white");

  assert.ok(baseWhite);
  assert.ok(directWhite);
  assert.ok(directWhite.ratio > baseWhite.ratio);
});

test("makes additional coats visually closer to the screen color", () => {
  const target = hexToRgb("#E14136");
  const paper = hexToRgb("#B28754");
  assert.ok(target);
  assert.ok(paper);

  const oneCoat = compositeOnPaper(target, paper, "direct", 1);
  const threeCoats = compositeOnPaper(target, paper, "direct", 3);
  assert.ok(colorDistance(threeCoats, target) < colorDistance(oneCoat, target));
});

test("supports RGB and HEX conversion without losing the target color", () => {
  const rgb = hexToRgb("#E14136");
  assert.ok(rgb);
  const converted = cmykToRgb(rgbToCmyk(rgb));

  assert.equal(rgbToHex(rgb), "#E14136");
  assert.ok(colorDistance(converted, rgb) < 4);
});

test("warns when a bright screen color is outside the practical palette", () => {
  const quality = getMatchQuality({ r: 0, g: 255, b: 80 }, "direct", 1);
  assert.equal(quality.level, "outside");
});
