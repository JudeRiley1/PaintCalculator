"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CALIBRATION,
  DEFAULT_CMYK,
  DEFAULT_PAPER_HEX,
  allocateExactDrops,
  clamp,
  cmykToRgb,
  compositeOnPaper,
  describeColor,
  getMatchQuality,
  getRecipeWeights,
  hexToRgb,
  rgbToCmyk,
  rgbToHex,
  type Cmyk,
  type PaintCalibration,
  type PaintKey,
  type Rgb,
  type SurfaceMode,
  type SwatchCorrection,
} from "./paint-logic";
import {
  CALIBRATION_KEY,
  PALETTE_KEY,
  SESSION_KEY,
  decodePalette,
  encodePalette,
  findNearDuplicate,
  moveColor,
  parseSavedColors,
  parseSessionSnapshot,
  reorderColors,
  type InputMode,
  type SavedColor,
  type SavedRecipePart,
  type SessionSnapshot,
  type Unit,
} from "./project-data";

type PaintDetail = {
  key: PaintKey;
  name: string;
  role: string;
  color: string;
};

const paintDetails: Record<PaintKey, PaintDetail> = {
  cyan: {
    key: "cyan",
    name: "Phthalocyanine Blue",
    role: "strong cyan stand-in",
    color: "#087a99",
  },
  magenta: {
    key: "magenta",
    name: "Medium Magenta",
    role: "strong red-violet mixer",
    color: "#c9306f",
  },
  yellow: {
    key: "yellow",
    name: "Yellow Medium",
    role: "warm primary",
    color: "#efbd1f",
  },
  black: {
    key: "black",
    name: "Mars Black",
    role: "very strong; added sparingly",
    color: "#252422",
  },
  white: {
    key: "white",
    name: "Titanium White",
    role: "coverage and dry-down lift",
    color: "#f3f1e8",
  },
};

const calibrationLabels: Record<number, string> = {
  0.85: "Weaker than expected",
  1: "Matches the starter swatch",
  1.15: "Stronger than expected",
};

const correctionOptions: Array<{
  value: SwatchCorrection;
  label: string;
  detail: string;
}> = [
  { value: "none", label: "No correction", detail: "Use the starter recipe." },
  { value: "too-dark", label: "Too dark", detail: "Lift with white; reduce black." },
  { value: "too-light", label: "Too light", detail: "Reduce white; deepen gently." },
  { value: "too-warm", label: "Too warm", detail: "Cool with a little more blue." },
  { value: "too-cool", label: "Too cool", detail: "Warm with yellow and magenta." },
  { value: "too-dull", label: "Too dull", detail: "Raise color; reduce black and white." },
];

const mixingOrder: Record<PaintKey, number> = {
  white: 0,
  yellow: 1,
  magenta: 2,
  cyan: 3,
  black: 4,
};

function formatAmount(amount: number, unit: Unit) {
  if (unit === "drops") return `${Math.round(amount)}`;
  if (amount < 0.1) return "<0.1";
  if (amount < 10) return amount.toFixed(1);
  return amount.toFixed(0);
}

function formatParts(parts: number) {
  if (parts < 0.1) return "trace";
  if (parts < 1) return parts.toFixed(1);
  return Number(parts.toFixed(1)).toString();
}

function getSavedCalibration(): PaintCalibration {
  if (typeof window === "undefined") return DEFAULT_CALIBRATION;
  try {
    const stored = window.localStorage.getItem(CALIBRATION_KEY);
    return stored
      ? { ...DEFAULT_CALIBRATION, ...(JSON.parse(stored) as Partial<PaintCalibration>) }
      : DEFAULT_CALIBRATION;
  } catch {
    return DEFAULT_CALIBRATION;
  }
}

function makeRecipeText(
  name: string,
  hex: string,
  cmyk: Cmyk,
  surface: SurfaceMode,
  paperHex: string,
  coats: number,
  amountPerCoat: number,
  totalMixAmount: number,
  unit: Unit,
  correction: SwatchCorrection,
  recipe: SavedRecipePart[],
) {
  const correctionLabel =
    correctionOptions.find((option) => option.value === correction)?.label ??
    "No correction";
  const lines = [
    `Paper + Paint — ${name}`,
    `Color: ${hex} · CMYK ${cmyk.c}/${cmyk.m}/${cmyk.y}/${cmyk.k}`,
    `Paper: ${paperHex} · ${surface === "direct" ? "Direct to paper" : "White base coat"}`,
    `Batch: ${formatAmount(amountPerCoat, unit)} ${unit} × ${coats} ${coats === 1 ? "coat" : "coats"} = ${formatAmount(totalMixAmount, unit)} ${unit}`,
    `Swatch correction: ${correctionLabel}`,
    "",
    ...recipe.map(
      (paint) => `${paint.name}: ${formatAmount(paint.amount, unit)} ${unit}`,
    ),
    "",
    "Mix lightest paints first. Add Phthalo Blue and Mars Black last, one small amount at a time.",
  ];
  return lines.join("\n");
}

function createRecipeCardImage(
  name: string,
  hex: string,
  setupLine: string,
  batchLine: string,
  recipe: SavedRecipePart[],
  unit: Unit,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const width = 1200;
  const height = 560 + recipe.length * 88;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);

  context.fillStyle = "#F8F6F1";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#19A8C5";
  context.fillRect(0, 0, width * 0.25, 12);
  context.fillStyle = "#DC3778";
  context.fillRect(width * 0.25, 0, width * 0.25, 12);
  context.fillStyle = "#F5CF2F";
  context.fillRect(width * 0.5, 0, width * 0.25, 12);
  context.fillStyle = "#292827";
  context.fillRect(width * 0.75, 0, width * 0.25, 12);

  context.fillStyle = "#27231F";
  context.font = "700 30px Georgia";
  context.fillText("Paper + Paint", 72, 78);
  context.font = "400 64px Georgia";
  context.fillText(name, 72, 165);
  context.fillStyle = hex;
  context.beginPath();
  context.arc(1080, 125, 58, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#FFFFFF";
  context.lineWidth = 10;
  context.stroke();

  context.fillStyle = "#6D6862";
  context.font = "500 25px Arial";
  context.fillText(setupLine, 72, 218);
  context.fillText(batchLine, 72, 258);

  let y = 330;
  for (const paint of recipe) {
    context.fillStyle = paint.color;
    context.beginPath();
    context.arc(92, y - 8, 24, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#27231F";
    context.font = "700 29px Arial";
    context.fillText(paint.name, 140, y);
    context.textAlign = "right";
    context.fillText(`${formatAmount(paint.amount, unit)} ${unit}`, 1120, y);
    context.textAlign = "left";
    context.strokeStyle = "rgba(50,43,37,.14)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(72, y + 36);
    context.lineTo(1128, y + 36);
    context.stroke();
    y += 88;
  }

  context.fillStyle = "#6D6862";
  context.font = "500 23px Arial";
  context.fillText(
    "Start light. Add Phthalo Blue and Mars Black last, a little at a time.",
    72,
    height - 72,
  );

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function PaintCalculator() {
  const initialHex = rgbToHex(cmykToRgb(DEFAULT_CMYK));
  const [cmyk, setCmyk] = useState<Cmyk>(DEFAULT_CMYK);
  const [rgbOverride, setRgbOverride] = useState<Rgb | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("cmyk");
  const [hexDraft, setHexDraft] = useState(initialHex);
  const [surface, setSurface] = useState<SurfaceMode>("direct");
  const [paperHex, setPaperHex] = useState(DEFAULT_PAPER_HEX);
  const [paperDraft, setPaperDraft] = useState(DEFAULT_PAPER_HEX);
  const [coats, setCoats] = useState(2);
  const [totalAmount, setTotalAmount] = useState(30);
  const [unit, setUnit] = useState<Unit>("drops");
  const [calibration, setCalibration] =
    useState<PaintCalibration>(DEFAULT_CALIBRATION);
  const [correction, setCorrection] = useState<SwatchCorrection>("none");
  const [customName, setCustomName] = useState("");
  const [savedColors, setSavedColors] = useState<SavedColor[]>([]);
  const [actionNotice, setActionNotice] = useState("");
  const [duplicateColor, setDuplicateColor] = useState<SavedColor | null>(null);
  const [draggedColorId, setDraggedColorId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedCalibration = getSavedCalibration();
      const session = parseSessionSnapshot(
        window.localStorage.getItem(SESSION_KEY),
        storedCalibration,
      );
      const sharedProject = new URLSearchParams(window.location.hash.slice(1)).get(
        "project",
      );
      const sharedColors = sharedProject ? decodePalette(sharedProject) : [];

      setSavedColors(
        sharedColors.length > 0
          ? sharedColors
          : parseSavedColors(window.localStorage.getItem(PALETTE_KEY)),
      );
      setCalibration(session?.calibration ?? storedCalibration);

      if (session) {
        setCmyk(session.cmyk);
        setRgbOverride(
          session.inputMode === "cmyk" ? null : hexToRgb(session.exactHex),
        );
        setInputMode(session.inputMode);
        setHexDraft(session.exactHex);
        setSurface(session.surface);
        setPaperHex(session.paperHex);
        setPaperDraft(session.paperHex);
        setCoats(session.coats);
        setTotalAmount(session.amountPerCoat);
        setUnit(session.unit);
        setCorrection(session.correction);
        setCustomName(session.customName);
      }

      if (sharedColors.length > 0) {
        window.localStorage.setItem(PALETTE_KEY, JSON.stringify(sharedColors));
        setActionNotice(`Loaded ${sharedColors.length} shared palette colors.`);
      }
      setSessionReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    const snapshot: SessionSnapshot = {
      cmyk,
      exactHex: rgbToHex(rgbOverride ?? cmykToRgb(cmyk)),
      inputMode,
      surface,
      paperHex,
      coats,
      amountPerCoat: totalAmount,
      unit,
      correction,
      customName,
      calibration,
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  }, [
    calibration,
    cmyk,
    coats,
    correction,
    customName,
    inputMode,
    paperHex,
    rgbOverride,
    sessionReady,
    surface,
    totalAmount,
    unit,
  ]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const timer = window.setTimeout(() => {
      const baseUrl = new URL(".", window.location.href);
      void navigator.serviceWorker.register(new URL("sw.js", baseUrl).pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const rgb = useMemo(() => rgbOverride ?? cmykToRgb(cmyk), [cmyk, rgbOverride]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);
  const paperRgb = useMemo(
    () => hexToRgb(paperHex) ?? (hexToRgb(DEFAULT_PAPER_HEX) as Rgb),
    [paperHex],
  );
  const paperEstimate = useMemo(
    () => rgbToHex(compositeOnPaper(rgb, paperRgb, surface, coats)),
    [rgb, paperRgb, surface, coats],
  );
  const colorName = useMemo(() => describeColor(rgb), [rgb]);
  const matchQuality = useMemo(
    () => getMatchQuality(rgb, surface, coats),
    [rgb, surface, coats],
  );
  const totalMixAmount = useMemo(() => {
    const perCoat =
      unit === "drops"
        ? Math.max(1, Math.round(totalAmount))
        : Math.max(0.1, totalAmount);
    return perCoat * coats;
  }, [coats, totalAmount, unit]);
  const recipeWeights = useMemo(() => {
    const minimumRatio =
      unit === "drops" ? Math.max(0.008, 0.5 / totalMixAmount) : 0.008;
    return getRecipeWeights(
      cmyk,
      surface,
      coats,
      calibration,
      minimumRatio,
      correction,
    );
  }, [calibration, cmyk, coats, correction, surface, totalMixAmount, unit]);
  const recipe = useMemo<SavedRecipePart[]>(() => {
    if (unit === "drops") {
      return allocateExactDrops(recipeWeights, totalMixAmount).map((paint) => ({
        ...paintDetails[paint.key],
        ...paint,
      }));
    }

    return recipeWeights.map((paint) => ({
      ...paintDetails[paint.key],
      ...paint,
      amount: paint.ratio * totalMixAmount,
    }));
  }, [recipeWeights, totalMixAmount, unit]);
  const recipeName = customName.trim() || colorName;
  const orderedRecipe = useMemo(
    () => [...recipe].sort((a, b) => mixingOrder[a.key] - mixingOrder[b.key]),
    [recipe],
  );
  const recipeText = useMemo(
    () =>
      makeRecipeText(
        recipeName,
        hex,
        cmyk,
        surface,
        paperHex,
        coats,
        totalAmount,
        totalMixAmount,
        unit,
        correction,
        recipe,
      ),
    [
      cmyk,
      coats,
      correction,
      hex,
      paperHex,
      recipe,
      recipeName,
      surface,
      totalAmount,
      totalMixAmount,
      unit,
    ],
  );

  function markRecipeChanged() {
    setActionNotice("");
    setDuplicateColor(null);
  }

  function updateChannel(channel: keyof Cmyk, value: number) {
    const nextCmyk = { ...cmyk, [channel]: clamp(value) };
    setCmyk(nextCmyk);
    setRgbOverride(null);
    setHexDraft(rgbToHex(cmykToRgb(nextCmyk)));
    markRecipeChanged();
  }

  function updateRgbChannel(channel: keyof Rgb, value: number) {
    const nextRgb = { ...rgb, [channel]: clamp(value, 0, 255) };
    setCmyk(rgbToCmyk(nextRgb));
    setRgbOverride(nextRgb);
    setHexDraft(rgbToHex(nextRgb));
    markRecipeChanged();
  }

  function updateHex(value: string) {
    setHexDraft(value);
    const parsed = hexToRgb(value);
    if (parsed) {
      setCmyk(rgbToCmyk(parsed));
      setRgbOverride(parsed);
      markRecipeChanged();
    }
  }

  function updatePaper(value: string) {
    setPaperDraft(value);
    const parsed = hexToRgb(value);
    if (parsed) {
      setPaperHex(rgbToHex(parsed));
      markRecipeChanged();
    }
  }

  function updateCalibration(key: PaintKey, value: number) {
    const updated = { ...calibration, [key]: value };
    setCalibration(updated);
    window.localStorage.setItem(CALIBRATION_KEY, JSON.stringify(updated));
    markRecipeChanged();
  }

  function resetCalibration() {
    setCalibration(DEFAULT_CALIBRATION);
    window.localStorage.removeItem(CALIBRATION_KEY);
    markRecipeChanged();
  }

  function persistPalette(colors: SavedColor[]) {
    setSavedColors(colors);
    window.localStorage.setItem(PALETTE_KEY, JSON.stringify(colors));
  }

  function buildSavedColor(id = `${Date.now()}-${hex}`): SavedColor {
    return {
      schemaVersion: 2,
      id,
      name: recipeName,
      hex,
      cmyk: { ...cmyk },
      surface,
      paperHex,
      coats,
      amountPerCoat: totalAmount,
      totalMixAmount,
      unit,
      correction,
      calibration: { ...calibration },
      recipe: recipe.map((paint) => ({ ...paint })),
      createdAt: Date.now(),
    };
  }

  function saveColor(force = false) {
    const nearDuplicate = findNearDuplicate(savedColors, hex);
    if (!force && nearDuplicate) {
      setDuplicateColor(nearDuplicate);
      setActionNotice("");
      return;
    }

    const next: SavedColor = {
      ...buildSavedColor(),
    };
    const updated = [next, ...savedColors].slice(0, 8);
    persistPalette(updated);
    setDuplicateColor(null);
    setActionNotice(`Saved “${next.name}” with its complete recipe.`);
  }

  function replaceDuplicate() {
    if (!duplicateColor) return;
    const replacement = buildSavedColor(duplicateColor.id);
    persistPalette(
      savedColors.map((color) =>
        color.id === duplicateColor.id ? replacement : color,
      ),
    );
    setDuplicateColor(null);
    setActionNotice(`Updated “${replacement.name}” with this recipe.`);
  }

  function removeColor(id: string) {
    const updated = savedColors.filter((color) => color.id !== id);
    persistPalette(updated);
  }

  function loadSavedColor(color: SavedColor) {
    setCmyk(color.cmyk);
    setRgbOverride(hexToRgb(color.hex));
    setHexDraft(color.hex);
    setSurface(color.surface);
    setPaperHex(color.paperHex);
    setPaperDraft(color.paperHex);
    setCoats(color.coats);
    setTotalAmount(color.amountPerCoat);
    setUnit(color.unit);
    setCorrection(color.correction);
    setCalibration(color.calibration);
    setCustomName(color.name);
    setDuplicateColor(null);
    setActionNotice(`Loaded the complete “${color.name}” recipe.`);
    document
      .querySelector(".calculator-grid")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reorderPalette(sourceId: string, targetId: string) {
    persistPalette(reorderColors(savedColors, sourceId, targetId));
    setDraggedColorId(null);
  }

  function movePaletteColor(id: string, direction: -1 | 1) {
    persistPalette(moveColor(savedColors, id, direction));
  }

  async function copyRecipe() {
    await copyTextToClipboard(recipeText);
    setActionNotice("Recipe copied.");
  }

  async function saveRecipeImage() {
    const setupLine = `${surface === "direct" ? "Direct to paper" : "White base coat"} · Paper ${paperHex}`;
    const batchLine = `${formatAmount(totalAmount, unit)} ${unit} × ${coats} ${coats === 1 ? "coat" : "coats"} = ${formatAmount(totalMixAmount, unit)} ${unit}`;
    const blob = await createRecipeCardImage(
      recipeName,
      hex,
      setupLine,
      batchLine,
      recipe,
      unit,
    );
    if (!blob) {
      setActionNotice("The recipe image could not be created.");
      return;
    }

    const filename = `${recipeName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "paint-recipe"}.png`;
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${recipeName} paint recipe` });
        setActionNotice("Recipe image ready to save or share.");
        return;
      } catch {
        return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setActionNotice("Recipe image downloaded.");
  }

  async function sharePalette() {
    if (savedColors.length === 0) {
      setActionNotice("Save at least one color before sharing the project.");
      return;
    }
    const url = new URL(window.location.href);
    url.hash = `project=${encodePalette(savedColors)}`;
    window.history.replaceState(null, "", url);

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Paper + Paint banner palette",
          text: `${savedColors.length} saved banner colors`,
          url: url.toString(),
        });
        setActionNotice("Project link ready to share.");
        return;
      } catch {
        return;
      }
    }

    await copyTextToClipboard(url.toString());
    setActionNotice("Shareable project link copied.");
  }

  function resetColor() {
    setCmyk(DEFAULT_CMYK);
    setRgbOverride(null);
    setHexDraft(initialHex);
    setCorrection("none");
    setCustomName("");
    markRecipeChanged();
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            P+
          </span>
          Paper + Paint
        </div>
        <div className="top-note">Made for banner painting</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Screen color to acrylic mixer</p>
          <h1>
            From screen to <em>brown paper.</em>
          </h1>
          <p className="hero-copy">
            Enter a banner color from Adobe and get a practical Master&apos;s Touch
            paint recipe, adjusted for your paper, coats, and dried swatches.
          </p>
        </div>
        <aside className="hero-tip">
          <strong>A good mix starts with a swatch.</strong>
          <p>
            The starter calibration accounts for strong pigments and acrylic
            dry-down. Fine-tune it with your own dried Master&apos;s Touch swatches.
          </p>
        </aside>
      </section>

      <section className="workspace" aria-label="Paint calculator">
        <div className="calculator-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="step-number">Step 01</span>
                <h2>Enter your Adobe color</h2>
              </div>
              <button className="reset-button" type="button" onClick={resetColor}>
                Reset
              </button>
            </div>

            <div className="input-content">
              <div className="input-tabs" role="group" aria-label="Color value type">
                {(["cmyk", "rgb", "hex"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={inputMode === mode}
                    onClick={() => {
                      setInputMode(mode);
                      if (mode === "hex") setHexDraft(hex);
                    }}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>

              {inputMode === "cmyk" && (
                <>
                  <p className="input-guide">
                    CMYK depends on the Adobe document profile. For the closest
                    match to what you see on screen, use Adobe&apos;s HEX or RGB value.
                  </p>
                  <div className="channel-list">
                    {(["c", "m", "y", "k"] as const).map((channel) => (
                      <div className="channel-row" key={channel}>
                        <label className="channel-label" htmlFor={`${channel}-range`}>
                          <span
                            className={`channel-dot ${channel}`}
                            aria-hidden="true"
                          />
                          {channel.toUpperCase()}
                        </label>
                        <input
                          id={`${channel}-range`}
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={cmyk[channel]}
                          onChange={(event) =>
                            updateChannel(channel, Number(event.target.value))
                          }
                          aria-label={`${channel.toUpperCase()} percentage`}
                        />
                        <div className="number-wrap">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            inputMode="numeric"
                            value={cmyk[channel] === 0 ? "" : cmyk[channel]}
                            placeholder="0"
                            onChange={(event) =>
                              updateChannel(channel, Number(event.target.value))
                            }
                            aria-label={`${channel.toUpperCase()} exact percentage`}
                          />
                          <span>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {inputMode === "rgb" && (
                <div className="rgb-grid">
                  {(["r", "g", "b"] as const).map((channel) => (
                    <div className="field" key={channel}>
                      <label htmlFor={`${channel}-value`}>
                        {channel === "r" ? "Red" : channel === "g" ? "Green" : "Blue"}
                      </label>
                      <input
                        id={`${channel}-value`}
                        type="number"
                        min="0"
                        max="255"
                        inputMode="numeric"
                        value={rgb[channel] === 0 ? "" : rgb[channel]}
                        placeholder="0"
                        onChange={(event) =>
                          updateRgbChannel(channel, Number(event.target.value))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {inputMode === "hex" && (
                <div className="hex-field field">
                  <label htmlFor="hex-value">Adobe HEX value</label>
                  <input
                    id="hex-value"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={7}
                    value={hexDraft}
                    onChange={(event) => updateHex(event.target.value)}
                    onBlur={() => {
                      setHexDraft(hex);
                    }}
                    aria-invalid={!hexToRgb(hexDraft)}
                    placeholder="#E14136"
                  />
                  {!hexToRgb(hexDraft) && (
                    <span className="field-error">Enter a 3- or 6-digit HEX color.</span>
                  )}
                </div>
              )}

              <div className="preview-strip">
                <div className="color-preview" style={{ background: hex }}>
                  <span>Screen · {hex}</span>
                </div>
                <div
                  className="color-preview"
                  style={{
                    backgroundColor: paperEstimate,
                    backgroundImage:
                      "linear-gradient(135deg, rgba(82,51,25,.08) 25%, transparent 25%)",
                    backgroundSize: "13px 13px",
                  }}
                >
                  <span>
                    Paper · {coats} {coats === 1 ? "coat" : "coats"}
                  </span>
                </div>
              </div>

              <p className="choice-title">How will you paint the brown paper?</p>
              <div
                className="segmented"
                role="group"
                aria-label="Brown paper preparation"
              >
                <button
                  type="button"
                  aria-pressed={surface === "white-base"}
                  onClick={() => {
                    setSurface("white-base");
                    markRecipeChanged();
                  }}
                >
                  White base coat
                  <br />
                  <small>most accurate</small>
                </button>
                <button
                  type="button"
                  aria-pressed={surface === "direct"}
                  onClick={() => {
                    setSurface("direct");
                    markRecipeChanged();
                  }}
                >
                  Direct to paper
                  <br />
                  <small>warmer result</small>
                </button>
              </div>

              <div className="paper-row">
                <div className="field paper-color-field">
                  <label htmlFor="paper-color">Your paper color</label>
                  <div className="color-input-wrap">
                    <input
                      id="paper-color"
                      type="color"
                      value={paperHex}
                      onChange={(event) => {
                        setPaperHex(event.target.value.toUpperCase());
                        setPaperDraft(event.target.value.toUpperCase());
                        markRecipeChanged();
                      }}
                    />
                    <input
                      type="text"
                      value={paperDraft}
                      maxLength={7}
                      onChange={(event) => updatePaper(event.target.value)}
                      onBlur={() => setPaperDraft(paperHex)}
                      aria-label="Paper color HEX value"
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="coat-count">Thin coats</label>
                  <select
                    id="coat-count"
                    value={coats}
                    onChange={(event) => {
                      setCoats(Number(event.target.value));
                      markRecipeChanged();
                    }}
                  >
                    <option value="1">1 coat</option>
                    <option value="2">2 coats</option>
                    <option value="3">3 coats</option>
                  </select>
                </div>
              </div>

              <div className="batch-row">
                <div className="field">
                  <label htmlFor="batch-size">Amount needed per coat</label>
                  <input
                    id="batch-size"
                    type="number"
                    min={unit === "drops" ? "1" : "0.1"}
                    max="999"
                    step={unit === "drops" ? "1" : "0.1"}
                    inputMode={unit === "drops" ? "numeric" : "decimal"}
                    value={totalAmount}
                    onChange={(event) => {
                      setTotalAmount(
                        Math.max(
                          unit === "drops" ? 1 : 0.1,
                          Number(event.target.value) || (unit === "drops" ? 1 : 0.1),
                        ),
                      );
                      markRecipeChanged();
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="unit">Measure in</label>
                  <select
                    id="unit"
                    value={unit}
                    onChange={(event) => {
                      setUnit(event.target.value as Unit);
                      markRecipeChanged();
                    }}
                  >
                    <option value="mL">milliliters</option>
                    <option value="tsp">teaspoons</option>
                    <option value="fl oz">fluid ounces</option>
                    <option value="drops">drops</option>
                  </select>
                </div>
              </div>

              <details className="calibration-card">
                <summary>Calibrate with your dried swatches</summary>
                <p>
                  The starter settings already use less Phthalo Blue and Mars Black
                  because they tint strongly. After a swatch dries, record whether
                  each paint acted weaker or stronger than expected. These settings
                  stay on this iPad.
                </p>
                <div className="calibration-grid">
                  {(Object.keys(paintDetails) as PaintKey[]).map((key) => (
                    <div className="field" key={key}>
                      <label htmlFor={`calibration-${key}`}>
                        {paintDetails[key].name}
                      </label>
                      <select
                        id={`calibration-${key}`}
                        value={calibration[key]}
                        onChange={(event) =>
                          updateCalibration(key, Number(event.target.value))
                        }
                      >
                        {Object.entries(calibrationLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <button className="text-button" type="button" onClick={resetCalibration}>
                  Reset swatch calibration
                </button>
              </details>
            </div>
          </section>

          <section className="panel result-panel" aria-live="polite">
            <div className="panel-header">
              <div className="result-top">
                <span
                  className="result-swatch"
                  style={{ background: hex }}
                  aria-hidden="true"
                />
                <div>
                  <span className="step-number">Step 02 · {recipeName}</span>
                  <h2>Your mix recipe</h2>
                </div>
              </div>
            </div>

            <div className="result-content">
              <div className={`match-card match-${matchQuality.level}`}>
                <span className="match-dot" aria-hidden="true" />
                <div>
                  <strong>{matchQuality.label}</strong>
                  <p>{matchQuality.detail}</p>
                </div>
              </div>

              <div className="accuracy-note">
                <b aria-hidden="true">✓</b>
                <span>
                  {surface === "white-base"
                    ? `Brush a thin Titanium White base first, let it dry, then use ${coats} thin ${coats === 1 ? "coat" : "coats"} of this mix.`
                    : `This formula adds coverage white and dry-down compensation for ${coats} thin ${coats === 1 ? "coat" : "coats"} directly on the paper.`}
                </span>
              </div>

              <section className="correction-card" aria-labelledby="correction-title">
                <div className="mini-section-heading">
                  <div>
                    <span className="step-number">After a dried test swatch</span>
                    <h3 id="correction-title">Make a small correction</h3>
                  </div>
                  {correction !== "none" && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setCorrection("none");
                        markRecipeChanged();
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="correction-grid">
                  {correctionOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={correction === option.value}
                      onClick={() => {
                        setCorrection(option.value);
                        markRecipeChanged();
                      }}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.detail}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="mix-total">
                <span>Total recipe</span>
                <strong>
                  {formatAmount(totalMixAmount, unit)} {unit}
                </strong>
                <small>
                  {formatAmount(totalAmount, unit)} {unit} × {coats}{" "}
                  {coats === 1 ? "coat" : "coats"}
                </small>
              </div>

              <div className="ratio-bar" aria-hidden="true">
                {recipe.map((paint) => (
                  <span
                    className="ratio-segment"
                    key={paint.key}
                    style={{
                      background: paint.color,
                      flexGrow: unit === "drops" ? paint.amount : paint.ratio,
                    }}
                  />
                ))}
              </div>

              <div className="recipe-list">
                {recipe.map((paint) => (
                  <div className="recipe-row" key={paint.key}>
                    <span
                      className="paint-chip"
                      style={{ background: paint.color }}
                      aria-hidden="true"
                    />
                    <div>
                      <span className="paint-name">{paint.name}</span>
                      <span className="paint-role">
                        Master&apos;s Touch · {paint.role}
                      </span>
                    </div>
                    <div className="paint-amount">
                      <strong>{formatAmount(paint.amount, unit)}</strong>
                      <span>{unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <section className="mixing-guide" aria-labelledby="mixing-guide-title">
                <span className="step-number">Safest mixing order</span>
                <h3 id="mixing-guide-title">Build the color slowly</h3>
                <ol>
                  {orderedRecipe.map((paint, index) => (
                    <li key={paint.key}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>
                          {index === 0 ? "Start with" : "Add"} {paint.name}
                        </strong>
                        <p>
                          {formatAmount(paint.amount, unit)} {unit}
                          {paint.key === "cyan" || paint.key === "black"
                            ? " — add a little at a time and mix completely."
                            : " — mix until the color is even."}
                        </p>
                      </div>
                    </li>
                  ))}
                  <li>
                    <span>{orderedRecipe.length + 1}</span>
                    <div>
                      <strong>Paint a small test and let it dry</strong>
                      <p>Return to the correction buttons if the dried swatch shifts.</p>
                    </div>
                  </li>
                </ol>
              </section>

              <p className="parts-line">
                No precise measure? Use a 10-part recipe:{" "}
                {recipe.map((paint, index) => (
                  <span key={paint.key}>
                    {index > 0 ? " · " : ""}
                    {formatParts(paint.parts)}{" "}
                    {paint.name.replace("Phthalocyanine", "Phthalo")}
                  </span>
                ))}
                .
              </p>

              <div className="recipe-name-field field">
                <label htmlFor="recipe-name">Name this banner color</label>
                <input
                  id="recipe-name"
                  type="text"
                  maxLength={60}
                  value={customName}
                  onChange={(event) => {
                    setCustomName(event.target.value);
                    markRecipeChanged();
                  }}
                  placeholder={`Example: ${colorName}`}
                />
              </div>

              <div className="recipe-actions" aria-label="Recipe actions">
                <button type="button" onClick={() => void copyRecipe()}>
                  Copy recipe
                </button>
                <button type="button" onClick={() => window.print()}>
                  Print
                </button>
                <button type="button" onClick={() => void saveRecipeImage()}>
                  Save image
                </button>
              </div>

              {duplicateColor && (
                <div className="duplicate-warning" role="alert">
                  <strong>Very similar to “{duplicateColor.name}.”</strong>
                  <p>Replace that saved recipe, or keep both colors?</p>
                  <div>
                    <button type="button" onClick={replaceDuplicate}>
                      Replace existing
                    </button>
                    <button type="button" onClick={() => saveColor(true)}>
                      Save both
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setDuplicateColor(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                className="primary-button"
                type="button"
                onClick={() => saveColor()}
              >
                <span className="palette-save-mark" aria-hidden="true">
                  +
                </span>
                <span className="palette-save-copy">
                  <strong>Save this color to banner palette</strong>
                  <small>Keeps the paper setup, coats, and exact paint amounts</small>
                </span>
                <span className="palette-save-arrow" aria-hidden="true">
                  →
                </span>
              </button>

              {actionNotice && (
                <p className="action-notice" role="status">
                  {actionNotice}
                </p>
              )}

              <div className="saved-section">
                <div className="saved-header">
                  <div>
                    <h3>Your banner palette</h3>
                    {savedColors.length > 0 && (
                      <span>{savedColors.length}/8 complete recipes</span>
                    )}
                  </div>
                  <button
                    className="share-button"
                    type="button"
                    onClick={() => void sharePalette()}
                  >
                    Share project link
                  </button>
                </div>
                <div className="saved-colors">
                  {savedColors.length === 0 ? (
                    <p className="saved-empty">
                      Save each Adobe color here while you plan the banner.
                    </p>
                  ) : (
                    savedColors.map((color) => (
                      <article
                        className="saved-color"
                        key={color.id}
                        style={{ background: color.hex }}
                        draggable
                        onDragStart={() => setDraggedColorId(color.id)}
                        onDragEnd={() => setDraggedColorId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedColorId) reorderPalette(draggedColorId, color.id);
                        }}
                      >
                        <span className="saved-drag" aria-hidden="true">
                          ⋮⋮
                        </span>
                        <button
                          className="saved-color-main"
                          type="button"
                          onClick={() => loadSavedColor(color)}
                          aria-label={`Use saved ${color.name} color`}
                        >
                          <b>{color.name}</b>
                          <span>
                            {color.cmyk.c}/{color.cmyk.m}/{color.cmyk.y}/
                            {color.cmyk.k}
                          </span>
                          <span>
                            {formatAmount(color.totalMixAmount, color.unit)}{" "}
                            {color.unit} · {color.surface === "direct" ? "direct" : "base"}
                          </span>
                        </button>
                        <div className="saved-controls">
                          <button
                            type="button"
                            onClick={() => movePaletteColor(color.id, -1)}
                            aria-label={`Move ${color.name} earlier`}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => movePaletteColor(color.id, 1)}
                            aria-label={`Move ${color.name} later`}
                          >
                            →
                          </button>
                          <button
                            type="button"
                            onClick={() => removeColor(color.id)}
                            aria-label={`Remove ${color.name}`}
                          >
                            ×
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <p className="footer-note">
        This is a studio starting recipe, not a color-managed formula. Adobe
        profiles, acrylic pigments, brush thickness, lighting, and your exact paper
        affect the dried result. Use the swatch calibration to tune future mixes.
        On iPad, use Share → Add to Home Screen to install it for offline use.
      </p>
    </main>
  );
}
