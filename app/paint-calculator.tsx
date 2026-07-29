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
} from "./paint-logic";

type Unit = "mL" | "tsp" | "fl oz" | "drops";
type InputMode = "cmyk" | "rgb" | "hex";
type SavedColor = Cmyk & { id: string; name: string; hex: string };

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

function getSavedColors(): SavedColor[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem("paper-paint-colors");
    return stored ? (JSON.parse(stored) as SavedColor[]) : [];
  } catch {
    return [];
  }
}

function getSavedCalibration(): PaintCalibration {
  if (typeof window === "undefined") return DEFAULT_CALIBRATION;
  try {
    const stored = window.localStorage.getItem("paper-paint-calibration");
    return stored
      ? { ...DEFAULT_CALIBRATION, ...(JSON.parse(stored) as Partial<PaintCalibration>) }
      : DEFAULT_CALIBRATION;
  } catch {
    return DEFAULT_CALIBRATION;
  }
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
  const [savedColors, setSavedColors] = useState<SavedColor[]>([]);
  const [savedNotice, setSavedNotice] = useState("Save this color to banner palette");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedColors(getSavedColors());
      setCalibration(getSavedCalibration());
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
    return getRecipeWeights(cmyk, surface, coats, calibration, minimumRatio);
  }, [calibration, cmyk, coats, surface, totalMixAmount, unit]);
  const recipe = useMemo(() => {
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

  function updateChannel(channel: keyof Cmyk, value: number) {
    const nextCmyk = { ...cmyk, [channel]: clamp(value) };
    setCmyk(nextCmyk);
    setRgbOverride(null);
    setHexDraft(rgbToHex(cmykToRgb(nextCmyk)));
    setSavedNotice("Save this color to banner palette");
  }

  function updateRgbChannel(channel: keyof Rgb, value: number) {
    const nextRgb = { ...rgb, [channel]: clamp(value, 0, 255) };
    setCmyk(rgbToCmyk(nextRgb));
    setRgbOverride(nextRgb);
    setHexDraft(rgbToHex(nextRgb));
    setSavedNotice("Save this color to banner palette");
  }

  function updateHex(value: string) {
    setHexDraft(value);
    const parsed = hexToRgb(value);
    if (parsed) {
      setCmyk(rgbToCmyk(parsed));
      setRgbOverride(parsed);
      setSavedNotice("Save this color to banner palette");
    }
  }

  function updatePaper(value: string) {
    setPaperDraft(value);
    const parsed = hexToRgb(value);
    if (parsed) setPaperHex(rgbToHex(parsed));
  }

  function updateCalibration(key: PaintKey, value: number) {
    const updated = { ...calibration, [key]: value };
    setCalibration(updated);
    window.localStorage.setItem("paper-paint-calibration", JSON.stringify(updated));
  }

  function resetCalibration() {
    setCalibration(DEFAULT_CALIBRATION);
    window.localStorage.removeItem("paper-paint-calibration");
  }

  function saveColor() {
    const next: SavedColor = {
      ...cmyk,
      id: `${Date.now()}-${hex}`,
      name: colorName,
      hex,
    };
    const updated = [next, ...savedColors].slice(0, 8);
    setSavedColors(updated);
    window.localStorage.setItem("paper-paint-colors", JSON.stringify(updated));
    setSavedNotice("Saved to this iPad");
  }

  function removeColor(id: string) {
    const updated = savedColors.filter((color) => color.id !== id);
    setSavedColors(updated);
    window.localStorage.setItem("paper-paint-colors", JSON.stringify(updated));
  }

  function loadSavedColor(color: SavedColor) {
    const nextCmyk = { c: color.c, m: color.m, y: color.y, k: color.k };
    setCmyk(nextCmyk);
    setRgbOverride(hexToRgb(color.hex));
    setHexDraft(rgbToHex(cmykToRgb(nextCmyk)));
    setSavedNotice("Save this color to banner palette");
    document
      .querySelector(".calculator-grid")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetColor() {
    setCmyk(DEFAULT_CMYK);
    setRgbOverride(null);
    setHexDraft(initialHex);
    setSavedNotice("Save this color to banner palette");
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
                  onClick={() => setSurface("white-base")}
                >
                  White base coat
                  <br />
                  <small>most accurate</small>
                </button>
                <button
                  type="button"
                  aria-pressed={surface === "direct"}
                  onClick={() => setSurface("direct")}
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
                    onChange={(event) => setCoats(Number(event.target.value))}
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
                    onChange={(event) =>
                      setTotalAmount(
                        Math.max(
                          unit === "drops" ? 1 : 0.1,
                          Number(event.target.value) || (unit === "drops" ? 1 : 0.1),
                        ),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="unit">Measure in</label>
                  <select
                    id="unit"
                    value={unit}
                    onChange={(event) => setUnit(event.target.value as Unit)}
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
                  <span className="step-number">Step 02 · {colorName}</span>
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

              <button className="primary-button" type="button" onClick={saveColor}>
                {savedNotice}
              </button>

              <div className="saved-section">
                <div className="saved-header">
                  <h3>Your banner palette</h3>
                  {savedColors.length > 0 && (
                    <span className="step-number">{savedColors.length}/8 saved</span>
                  )}
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
                      >
                        <button
                          className="saved-color-main"
                          type="button"
                          onClick={() => loadSavedColor(color)}
                          aria-label={`Use saved ${color.name} color`}
                        >
                          <b>{color.name}</b>
                          <span>
                            {color.c}/{color.m}/{color.y}/{color.k}
                          </span>
                        </button>
                        <button
                          className="saved-remove"
                          type="button"
                          onClick={() => removeColor(color.id)}
                          aria-label={`Remove ${color.name}`}
                        >
                          ×
                        </button>
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
      </p>
    </main>
  );
}
