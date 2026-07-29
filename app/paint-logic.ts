export type Cmyk = { c: number; m: number; y: number; k: number };
export type Rgb = { r: number; g: number; b: number };
export type SurfaceMode = "white-base" | "direct";
export type PaintKey = "cyan" | "magenta" | "yellow" | "black" | "white";
export type PaintCalibration = Record<PaintKey, number>;
export type MatchQuality = {
  level: "good" | "approximate" | "outside";
  label: string;
  detail: string;
};

export type RecipeWeight = {
  key: PaintKey;
  weight: number;
  ratio: number;
  parts: number;
};

export const DEFAULT_CMYK: Cmyk = { c: 8, m: 72, y: 78, k: 4 };
export const DEFAULT_PAPER_HEX = "#B28754";
export const DEFAULT_CALIBRATION: PaintCalibration = {
  cyan: 1,
  magenta: 1,
  yellow: 1,
  black: 1,
  white: 1,
};

// Relative tinting strength for the Master's Touch starting palette.
// Stronger pigments need less physical paint to make the same visual change.
const BASE_TINT_STRENGTH: PaintCalibration = {
  cyan: 1.42,
  magenta: 1.14,
  yellow: 0.88,
  black: 1.72,
  white: 0.76,
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

export function cmykToRgb({ c, m, y, k }: Cmyk): Rgb {
  const cyan = clamp(c) / 100;
  const magenta = clamp(m) / 100;
  const yellow = clamp(y) / 100;
  const black = clamp(k) / 100;

  return {
    r: Math.round(255 * (1 - cyan) * (1 - black)),
    g: Math.round(255 * (1 - magenta) * (1 - black)),
    b: Math.round(255 * (1 - yellow) * (1 - black)),
  };
}

export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const k = 1 - Math.max(red, green, blue);

  if (k >= 0.9999) return { c: 0, m: 0, y: 0, k: 100 };

  return {
    c: Math.round(((1 - red - k) / (1 - k)) * 100),
    m: Math.round(((1 - green - k) / (1 - k)) * 100),
    y: Math.round(((1 - blue - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

export function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function hexToRgb(value: string): Rgb | null {
  const normalized = value.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;

  if (!/^[\dA-Fa-f]{6}$/.test(expanded)) return null;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

export function compositeOnPaper(
  rgb: Rgb,
  paperRgb: Rgb,
  mode: SurfaceMode,
  coats: number,
): Rgb {
  const coatCount = Math.round(clamp(coats, 1, 3));
  const luminance = getLuminance(rgb);
  const singleCoatOpacity =
    mode === "white-base" ? 0.94 : 0.64 + (1 - luminance) * 0.1;
  const opacity = 1 - Math.pow(1 - singleCoatOpacity, coatCount);

  return {
    r: Math.round(rgb.r * opacity + paperRgb.r * (1 - opacity)),
    g: Math.round(rgb.g * opacity + paperRgb.g * (1 - opacity)),
    b: Math.round(rgb.b * opacity + paperRgb.b * (1 - opacity)),
  };
}

export function getLuminance(rgb: Rgb) {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

export function describeColor(rgb: Rgb) {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const light = (max + min) / 510;
  const delta = max - min;

  if (light > 0.91 && delta < 18) return "Soft white";
  if (light < 0.12) return "Near black";
  if (delta < 20) {
    return light > 0.62 ? "Light neutral" : light > 0.35 ? "Mid neutral" : "Charcoal";
  }

  let hue = 0;
  if (max === rgb.r) hue = ((rgb.g - rgb.b) / delta + (rgb.g < rgb.b ? 6 : 0)) * 60;
  else if (max === rgb.g) hue = ((rgb.b - rgb.r) / delta + 2) * 60;
  else hue = ((rgb.r - rgb.g) / delta + 4) * 60;

  const tone = light > 0.72 ? "Light " : light < 0.3 ? "Deep " : "";
  if (hue < 15 || hue >= 345) return `${tone}red`;
  if (hue < 42) return `${tone}orange`;
  if (hue < 68) return `${tone}yellow`;
  if (hue < 165) return `${tone}green`;
  if (hue < 198) return `${tone}teal`;
  if (hue < 255) return `${tone}blue`;
  if (hue < 292) return `${tone}violet`;
  if (hue < 345) return `${tone}magenta`;
  return `${tone}red`;
}

export function getMatchQuality(
  rgb: Rgb,
  surface: SurfaceMode,
  coats: number,
): MatchQuality {
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = getLuminance(rgb);

  if (
    (saturation > 0.9 && max > 0.88) ||
    (surface === "direct" && coats === 1 && luminance > 0.84)
  ) {
    return {
      level: "outside",
      label: "Outside the available paint range",
      detail: "This screen color is brighter or cleaner than this five-paint palette can reproduce.",
    };
  }

  if (
    saturation > 0.68 ||
    luminance < 0.11 ||
    luminance > 0.82 ||
    (surface === "direct" && coats === 1)
  ) {
    return {
      level: "approximate",
      label: "Approximate match",
      detail: "Expect a visible paper or pigment shift. A dried swatch will be important.",
    };
  }

  return {
    level: "good",
    label: "Good match expected",
    detail: "This color sits in a practical range for the selected paint and paper setup.",
  };
}

export function getRecipeWeights(
  cmyk: Cmyk,
  surface: SurfaceMode,
  coats: number,
  calibration: PaintCalibration = DEFAULT_CALIBRATION,
  minimumRatio = 0.008,
): RecipeWeight[] {
  const c = clamp(cmyk.c) / 100;
  const m = clamp(cmyk.m) / 100;
  const y = clamp(cmyk.y) / 100;
  const k = clamp(cmyk.k) / 100;
  const rgb = cmykToRgb(cmyk);
  const luminance = getLuminance(rgb);
  const darkness = 1 - luminance;
  const shared = Math.min(c, m, y) * (1 - k);

  // Preserve much of a CMY neutral as a mixed neutral instead of replacing it
  // entirely with black. Deeper colors receive a little more Mars Black.
  const preservedNeutral = shared * (0.72 - darkness * 0.2);
  const blackFromNeutral = shared * (0.16 + darkness * 0.24);

  const opticalWeights: Record<PaintKey, number> = {
    cyan: Math.max(0, c * (1 - k) - shared) + preservedNeutral,
    magenta: Math.max(0, m * (1 - k) - shared) + preservedNeutral,
    yellow: Math.max(0, y * (1 - k) - shared) + preservedNeutral,
    black: k * 0.86 + blackFromNeutral,
    white: (1 - Math.max(c, m, y)) * (1 - k),
  };

  // Acrylic dry-down compensation and direct-to-paper coverage compensation.
  opticalWeights.white += 0.035 + darkness * (surface === "direct" ? 0.065 : 0.04);
  if (surface === "direct") {
    opticalWeights.white += (0.1 + luminance * 0.2) / Math.sqrt(clamp(coats, 1, 3));
  }

  const physicalWeights = (Object.keys(opticalWeights) as PaintKey[]).map((key) => {
    const calibrationMultiplier = clamp(calibration[key], 0.7, 1.35);
    const strength = BASE_TINT_STRENGTH[key] * calibrationMultiplier;
    return { key, weight: opticalWeights[key] / strength };
  });

  const initialTotal = physicalWeights.reduce((sum, paint) => sum + paint.weight, 0);
  const eligible = physicalWeights.filter(
    (paint) => initialTotal > 0 && paint.weight / initialTotal >= minimumRatio,
  );
  const kept =
    eligible.length > 0
      ? eligible
      : [
          physicalWeights.reduce((largest, paint) =>
            paint.weight > largest.weight ? paint : largest,
          ),
        ];
  const keptTotal = kept.reduce((sum, paint) => sum + paint.weight, 0);

  return kept.map((paint) => {
    const ratio = paint.weight / keptTotal;
    return {
      ...paint,
      ratio,
      parts: ratio * 10,
    };
  });
}

export function allocateExactDrops(
  recipe: RecipeWeight[],
  requestedDrops: number,
): Array<RecipeWeight & { amount: number }> {
  const totalDrops = Math.max(1, Math.round(requestedDrops));
  const ideals = recipe.map((paint) => paint.ratio * totalDrops);
  const amounts = ideals.map(Math.floor);
  const remaining = totalDrops - amounts.reduce((sum, amount) => sum + amount, 0);

  const remainderOrder = ideals
    .map((ideal, index) => ({ index, remainder: ideal - Math.floor(ideal) }))
    .sort((a, b) => b.remainder - a.remainder || recipe[b.index].ratio - recipe[a.index].ratio);

  for (let index = 0; index < remaining; index += 1) {
    amounts[remainderOrder[index].index] += 1;
  }

  return recipe
    .map((paint, index) => ({ ...paint, amount: amounts[index] }))
    .filter((paint) => paint.amount > 0);
}
