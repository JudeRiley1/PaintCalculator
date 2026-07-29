"use client";

import { useEffect, useMemo, useState } from "react";

type Cmyk = { c: number; m: number; y: number; k: number };
type SurfaceMode = "white-base" | "direct";
type Unit = "mL" | "tsp" | "fl oz" | "drops";
type SavedColor = Cmyk & { id: string; name: string; hex: string };

type Paint = {
  key: string;
  name: string;
  role: string;
  color: string;
  weight: number;
  amount: number;
  parts: number;
};

const DEFAULT_CMYK: Cmyk = { c: 8, m: 72, y: 78, k: 4 };
const BROWN_PAPER = { r: 178, g: 135, b: 84 };

const paintDetails: Record<string, Omit<Paint, "weight" | "amount" | "parts">> = {
  cyan: {
    key: "cyan",
    name: "Phthalocyanine Blue",
    role: "your cyan stand-in",
    color: "#087a99",
  },
  magenta: {
    key: "magenta",
    name: "Medium Magenta",
    role: "the red-violet mixer",
    color: "#c9306f",
  },
  yellow: {
    key: "yellow",
    name: "Yellow Medium",
    role: "the warm primary",
    color: "#efbd1f",
  },
  black: {
    key: "black",
    name: "Mars Black",
    role: "add sparingly",
    color: "#252422",
  },
  white: {
    key: "white",
    name: "Titanium White",
    role: "lightens + improves coverage",
    color: "#f3f1e8",
  },
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function cmykToRgb({ c, m, y, k }: Cmyk) {
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

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function compositeOnBrown(rgb: { r: number; g: number; b: number }, mode: SurfaceMode) {
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  const opacity = mode === "white-base" ? 0.98 : 0.74 + (1 - luminance) * 0.1;

  return {
    r: Math.round(rgb.r * opacity + BROWN_PAPER.r * (1 - opacity)),
    g: Math.round(rgb.g * opacity + BROWN_PAPER.g * (1 - opacity)),
    b: Math.round(rgb.b * opacity + BROWN_PAPER.b * (1 - opacity)),
  };
}

function describeColor(rgb: { r: number; g: number; b: number }) {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const light = (max + min) / 510;
  const delta = max - min;

  if (light > 0.91 && delta < 18) return "Soft white";
  if (light < 0.12) return "Near black";
  if (delta < 20) return light > 0.62 ? "Light neutral" : light > 0.35 ? "Mid neutral" : "Charcoal";

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

function getRecipe(cmyk: Cmyk, surface: SurfaceMode, totalAmount: number): Paint[] {
  const c = clamp(cmyk.c) / 100;
  const m = clamp(cmyk.m) / 100;
  const y = clamp(cmyk.y) / 100;
  const k = clamp(cmyk.k) / 100;
  const shared = Math.min(c, m, y) * (1 - k);
  const rgb = cmykToRgb(cmyk);
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  const weights: Record<string, number> = {
    cyan: Math.max(0, c - Math.min(c, m, y)) * (1 - k),
    magenta: Math.max(0, m - Math.min(c, m, y)) * (1 - k),
    yellow: Math.max(0, y - Math.min(c, m, y)) * (1 - k),
    black: k * 1.05 + shared * 0.68,
    white: (1 - Math.max(c, m, y)) * (1 - k),
  };

  if (surface === "direct") {
    weights.white += 0.12 + luminance * 0.22;
  }

  let totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (totalWeight < 0.001) {
    weights.white = 1;
    totalWeight = 1;
  }

  return Object.entries(weights)
    .filter(([, weight]) => weight / totalWeight >= 0.008)
    .map(([key, weight]) => ({
      ...paintDetails[key],
      weight,
      amount: (weight / totalWeight) * totalAmount,
      parts: (weight / totalWeight) * 10,
    }));
}

function formatAmount(amount: number, unit: Unit) {
  if (unit === "drops") return `${Math.max(1, Math.round(amount))}`;
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

export function PaintCalculator() {
  const [cmyk, setCmyk] = useState<Cmyk>(DEFAULT_CMYK);
  const [surface, setSurface] = useState<SurfaceMode>("direct");
  const [totalAmount, setTotalAmount] = useState(30);
  const [unit, setUnit] = useState<Unit>("drops");
  const [savedColors, setSavedColors] = useState<SavedColor[]>([]);
  const [savedNotice, setSavedNotice] = useState("Save this color to banner palette");

  useEffect(() => {
    const timer = window.setTimeout(() => setSavedColors(getSavedColors()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const rgb = useMemo(() => cmykToRgb(cmyk), [cmyk]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);
  const paperHex = useMemo(() => rgbToHex(compositeOnBrown(rgb, surface)), [rgb, surface]);
  const colorName = useMemo(() => describeColor(rgb), [rgb]);
  const recipe = useMemo(
    () => getRecipe(cmyk, surface, Math.max(0.1, totalAmount)),
    [cmyk, surface, totalAmount],
  );

  function updateChannel(channel: keyof Cmyk, value: number) {
    setCmyk((current) => ({ ...current, [channel]: clamp(value) }));
    setSavedNotice("Save this color to banner palette");
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
    setCmyk({ c: color.c, m: color.m, y: color.y, k: color.k });
    setSavedNotice("Save this color to banner palette");
    document.querySelector(".calculator-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">P+</span>
          Paper + Paint
        </div>
        <div className="top-note">Made for banner painting</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">CMYK to acrylic mixer</p>
          <h1>
            From screen to <em>brown paper.</em>
          </h1>
          <p className="hero-copy">
            Enter a banner color from Adobe and get a practical Master&apos;s Touch paint
            recipe, scaled to the amount you need.
          </p>
        </div>
        <aside className="hero-tip">
          <strong>A good mix starts with a swatch.</strong>
          <p>
            Screen color, pigment, and paper all behave differently. Use this as your
            first mix, let a small test dry, then make the tiny adjustment it suggests.
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
              <button
                className="reset-button"
                type="button"
                onClick={() => setCmyk(DEFAULT_CMYK)}
              >
                Reset
              </button>
            </div>

            <div className="input-content">
              <div className="channel-list">
                {(["c", "m", "y", "k"] as const).map((channel) => (
                  <div className="channel-row" key={channel}>
                    <label className="channel-label" htmlFor={`${channel}-range`}>
                      <span className={`channel-dot ${channel}`} aria-hidden="true" />
                      {channel.toUpperCase()}
                    </label>
                    <input
                      id={`${channel}-range`}
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={cmyk[channel]}
                      onChange={(event) => updateChannel(channel, Number(event.target.value))}
                      aria-label={`${channel.toUpperCase()} percentage`}
                    />
                    <div className="number-wrap">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        inputMode="numeric"
                        value={cmyk[channel]}
                        onChange={(event) => updateChannel(channel, Number(event.target.value))}
                        aria-label={`${channel.toUpperCase()} exact percentage`}
                      />
                      <span>%</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="preview-strip">
                <div className="color-preview" style={{ background: hex }}>
                  <span>Screen · {hex}</span>
                </div>
                <div
                  className="color-preview"
                  style={{
                    backgroundColor: paperHex,
                    backgroundImage:
                      "linear-gradient(135deg, rgba(82,51,25,.08) 25%, transparent 25%)",
                    backgroundSize: "13px 13px",
                  }}
                >
                  <span>Paper estimate</span>
                </div>
              </div>

              <p className="choice-title">How will you paint the brown paper?</p>
              <div className="segmented" role="group" aria-label="Brown paper preparation">
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

              <div className="batch-row">
                <div className="field">
                  <label htmlFor="batch-size">Total mix amount</label>
                  <input
                    id="batch-size"
                    type="number"
                    min="0.1"
                    max="999"
                    step="0.1"
                    inputMode="decimal"
                    value={totalAmount}
                    onChange={(event) => setTotalAmount(Math.max(0.1, Number(event.target.value) || 0.1))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="unit">Measure in</label>
                  <select id="unit" value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
                    <option value="mL">milliliters</option>
                    <option value="tsp">teaspoons</option>
                    <option value="fl oz">fluid ounces</option>
                    <option value="drops">drops</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="panel result-panel" aria-live="polite">
            <div className="panel-header">
              <div className="result-top">
                <span className="result-swatch" style={{ background: hex }} aria-hidden="true" />
                <div>
                  <span className="step-number">Step 02 · {colorName}</span>
                  <h2>Your mix recipe</h2>
                </div>
              </div>
            </div>

            <div className="result-content">
              <div className="accuracy-note">
                <b aria-hidden="true">✓</b>
                <span>
                  {surface === "white-base"
                    ? "Brush 1–2 thin coats of Titanium White under this color first. Let the base dry before painting."
                    : "This recipe adds extra Titanium White for coverage. Plan on 2 thin coats; the brown paper will still warm the color."}
                </span>
              </div>

              <div className="ratio-bar" aria-hidden="true">
                {recipe.map((paint) => (
                  <span
                    className="ratio-segment"
                    key={paint.key}
                    style={{ background: paint.color, flexGrow: paint.weight }}
                  />
                ))}
              </div>

              <div className="recipe-list">
                {recipe.map((paint) => (
                  <div className="recipe-row" key={paint.key}>
                    <span className="paint-chip" style={{ background: paint.color }} aria-hidden="true" />
                    <div>
                      <span className="paint-name">{paint.name}</span>
                      <span className="paint-role">Master&apos;s Touch · {paint.role}</span>
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
                    {formatParts(paint.parts)} {paint.name.replace("Phthalocyanine", "Phthalo")}
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
                  {savedColors.length > 0 && <span className="step-number">{savedColors.length}/8 saved</span>}
                </div>
                <div className="saved-colors">
                  {savedColors.length === 0 ? (
                    <p className="saved-empty">Save each Adobe color here while you plan the banner.</p>
                  ) : (
                    savedColors.map((color) => (
                      <article className="saved-color" key={color.id} style={{ background: color.hex }}>
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
        This is a studio starting recipe, not a color-managed formula. CMYK describes printer ink,
        while acrylic pigment, paint line, brush thickness, lighting, and the exact brown paper all
        affect the finished color.
      </p>
    </main>
  );
}
