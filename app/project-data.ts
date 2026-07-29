import {
  DEFAULT_CMYK,
  DEFAULT_PAPER_HEX,
  clamp,
  cmykToRgb,
  hexToRgb,
  rgbToHex,
  type Cmyk,
  type PaintCalibration,
  type PaintKey,
  type SurfaceMode,
  type SwatchCorrection,
} from "./paint-logic.ts";

export type Unit = "mL" | "tsp" | "fl oz" | "drops";
export type InputMode = "cmyk" | "rgb" | "hex";

export type SavedRecipePart = {
  key: PaintKey;
  name: string;
  role: string;
  color: string;
  amount: number;
  ratio: number;
  parts: number;
};

export type SavedColor = {
  schemaVersion: 2;
  id: string;
  name: string;
  hex: string;
  cmyk: Cmyk;
  surface: SurfaceMode;
  paperHex: string;
  coats: number;
  amountPerCoat: number;
  totalMixAmount: number;
  unit: Unit;
  correction: SwatchCorrection;
  calibration: PaintCalibration;
  recipe: SavedRecipePart[];
  createdAt: number;
};

export type SessionSnapshot = {
  cmyk: Cmyk;
  exactHex: string;
  inputMode: InputMode;
  surface: SurfaceMode;
  paperHex: string;
  coats: number;
  amountPerCoat: number;
  unit: Unit;
  correction: SwatchCorrection;
  customName: string;
  calibration: PaintCalibration;
};

export const PALETTE_KEY = "paper-paint-colors";
export const CALIBRATION_KEY = "paper-paint-calibration";
export const SESSION_KEY = "paper-paint-session-v2";

const paintKeys = new Set<PaintKey>(["cyan", "magenta", "yellow", "black", "white"]);
const units = new Set<Unit>(["mL", "tsp", "fl oz", "drops"]);
const corrections = new Set<SwatchCorrection>([
  "none",
  "too-dark",
  "too-light",
  "too-warm",
  "too-cool",
  "too-dull",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCmyk(value: unknown): Cmyk {
  if (!isRecord(value)) return DEFAULT_CMYK;
  return {
    c: clamp(safeNumber(value.c, DEFAULT_CMYK.c)),
    m: clamp(safeNumber(value.m, DEFAULT_CMYK.m)),
    y: clamp(safeNumber(value.y, DEFAULT_CMYK.y)),
    k: clamp(safeNumber(value.k, DEFAULT_CMYK.k)),
  };
}

function normalizeRecipe(value: unknown): SavedRecipePart[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (part): part is Record<string, unknown> =>
        isRecord(part) && paintKeys.has(part.key as PaintKey),
    )
    .map((part) => ({
      key: part.key as PaintKey,
      name: String(part.name ?? part.key),
      role: String(part.role ?? ""),
      color: String(part.color ?? "#777777"),
      amount: Math.max(0, safeNumber(part.amount, 0)),
      ratio: Math.max(0, safeNumber(part.ratio, 0)),
      parts: Math.max(0, safeNumber(part.parts, 0)),
    }));
}

export function normalizeSavedColor(value: unknown, index = 0): SavedColor | null {
  if (!isRecord(value)) return null;

  const cmyk = normalizeCmyk(isRecord(value.cmyk) ? value.cmyk : value);
  const parsedHex = typeof value.hex === "string" ? hexToRgb(value.hex) : null;
  const hex = parsedHex ? rgbToHex(parsedHex) : rgbToHex(cmykToRgb(cmyk));
  const surface: SurfaceMode = value.surface === "white-base" ? "white-base" : "direct";
  const paper =
    typeof value.paperHex === "string" && hexToRgb(value.paperHex)
      ? rgbToHex(hexToRgb(value.paperHex)!)
      : DEFAULT_PAPER_HEX;
  const coats = Math.round(clamp(safeNumber(value.coats, 2), 1, 3));
  const amountPerCoat = Math.max(
    0.1,
    safeNumber(value.amountPerCoat ?? value.totalAmount, 30),
  );
  const unit = units.has(value.unit as Unit) ? (value.unit as Unit) : "drops";
  const correction = corrections.has(value.correction as SwatchCorrection)
    ? (value.correction as SwatchCorrection)
    : "none";
  const storedCalibration = isRecord(value.calibration) ? value.calibration : {};
  const calibration = { cyan: 1, magenta: 1, yellow: 1, black: 1, white: 1 };
  for (const key of paintKeys) {
    calibration[key] = clamp(safeNumber(storedCalibration[key], 1), 0.85, 1.15);
  }

  return {
    schemaVersion: 2,
    id: String(value.id ?? `imported-${Date.now()}-${index}`),
    name: String(value.name ?? "Saved color").slice(0, 60),
    hex,
    cmyk,
    surface,
    paperHex: paper,
    coats,
    amountPerCoat,
    totalMixAmount: Math.max(
      0.1,
      safeNumber(value.totalMixAmount, amountPerCoat * coats),
    ),
    unit,
    correction,
    calibration,
    recipe: normalizeRecipe(value.recipe),
    createdAt: Math.max(0, safeNumber(value.createdAt, Date.now())),
  };
}

export function parseSavedColors(stored: string | null): SavedColor[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((color, index) => normalizeSavedColor(color, index))
      .filter((color): color is SavedColor => color !== null)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function parseSessionSnapshot(
  stored: string | null,
  fallbackCalibration: PaintCalibration,
): SessionSnapshot | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (!isRecord(value)) return null;
    const cmyk = normalizeCmyk(value.cmyk);
    const exactRgb =
      typeof value.exactHex === "string" ? hexToRgb(value.exactHex) : null;
    const inputMode: InputMode =
      value.inputMode === "rgb" || value.inputMode === "hex" ? value.inputMode : "cmyk";
    const surface: SurfaceMode =
      value.surface === "white-base" ? "white-base" : "direct";
    const paperRgb =
      typeof value.paperHex === "string" ? hexToRgb(value.paperHex) : null;
    const unit = units.has(value.unit as Unit) ? (value.unit as Unit) : "drops";
    const correction = corrections.has(value.correction as SwatchCorrection)
      ? (value.correction as SwatchCorrection)
      : "none";
    const storedCalibration = isRecord(value.calibration) ? value.calibration : {};
    const calibration = { ...fallbackCalibration };
    for (const key of paintKeys) {
      calibration[key] = clamp(
        safeNumber(storedCalibration[key], fallbackCalibration[key]),
        0.85,
        1.15,
      );
    }

    return {
      cmyk,
      exactHex: exactRgb ? rgbToHex(exactRgb) : rgbToHex(cmykToRgb(cmyk)),
      inputMode,
      surface,
      paperHex: paperRgb ? rgbToHex(paperRgb) : DEFAULT_PAPER_HEX,
      coats: Math.round(clamp(safeNumber(value.coats, 2), 1, 3)),
      amountPerCoat: Math.max(0.1, safeNumber(value.amountPerCoat, 30)),
      unit,
      correction,
      customName: String(value.customName ?? "").slice(0, 60),
      calibration,
    };
  } catch {
    return null;
  }
}

export function findNearDuplicate(
  colors: SavedColor[],
  hex: string,
  threshold = 14,
): SavedColor | null {
  const target = hexToRgb(hex);
  if (!target) return null;

  return (
    colors.find((color) => {
      const existing = hexToRgb(color.hex);
      if (!existing) return false;
      return (
        Math.hypot(
          target.r - existing.r,
          target.g - existing.g,
          target.b - existing.b,
        ) <= threshold
      );
    }) ?? null
  );
}

export function reorderColors(
  colors: SavedColor[],
  sourceId: string,
  targetId: string,
): SavedColor[] {
  const sourceIndex = colors.findIndex((color) => color.id === sourceId);
  const targetIndex = colors.findIndex((color) => color.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return colors;

  const updated = [...colors];
  const [moved] = updated.splice(sourceIndex, 1);
  updated.splice(targetIndex, 0, moved);
  return updated;
}

export function moveColor(
  colors: SavedColor[],
  id: string,
  direction: -1 | 1,
): SavedColor[] {
  const index = colors.findIndex((color) => color.id === id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= colors.length) return colors;

  const updated = [...colors];
  [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
  return updated;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodePalette(colors: SavedColor[]) {
  const payload = JSON.stringify({ version: 2, colors: colors.slice(0, 8) });
  return bytesToBase64Url(new TextEncoder().encode(payload));
}

export function decodePalette(value: string): SavedColor[] {
  try {
    const payload: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(value)),
    );
    if (!isRecord(payload) || !Array.isArray(payload.colors)) return [];
    return payload.colors
      .map((color, index) => normalizeSavedColor(color, index))
      .filter((color): color is SavedColor => color !== null)
      .slice(0, 8);
  } catch {
    return [];
  }
}
