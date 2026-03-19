import { useState, useCallback, useRef, useEffect } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

// ─── Types ──────────────────────────────────────────────────────
interface RGB { r: number; g: number; b: number; }
interface HSL { h: number; s: number; l: number; }

type Tab = 'checker' | 'palette' | 'blindness';
type ColorInputMode = 'hex' | 'rgb' | 'hsl' | 'picker';

// ─── Color Math ─────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string): RGB | null {
  const h = hex.replace('#', '');
  const m6 = h.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m6) return { r: parseInt(m6[1], 16), g: parseInt(m6[2], 16), b: parseInt(m6[3], 16) };
  const m3 = h.match(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m3) return { r: parseInt(m3[1]+m3[1], 16), g: parseInt(m3[2]+m3[2], 16), b: parseInt(m3[3]+m3[3], 16) };
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
  };
}

// ─── WCAG Contrast ──────────────────────────────────────────────
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(c1: RGB, c2: RGB): number {
  const l1 = getLuminance(c1.r, c1.g, c1.b);
  const l2 = getLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Suggested Fix ──────────────────────────────────────────────
function findNearestPassingColor(
  fixColor: RGB,
  otherColor: RGB,
  targetRatio: number,
  adjustForeground: boolean
): RGB {
  const hsl = rgbToHsl(fixColor.r, fixColor.g, fixColor.b);
  let bestColor = fixColor;
  let bestDiff = Infinity;
  const otherLum = getLuminance(otherColor.r, otherColor.g, otherColor.b);

  // Try adjusting lightness in both directions
  for (let l = 0; l <= 100; l += 0.5) {
    const candidate = hslToRgb(hsl.h, hsl.s, l);
    const candidateLum = getLuminance(candidate.r, candidate.g, candidate.b);
    const lighter = Math.max(candidateLum, otherLum);
    const darker = Math.min(candidateLum, otherLum);
    const ratio = (lighter + 0.05) / (darker + 0.05);

    if (ratio >= targetRatio) {
      const diff = Math.abs(l - hsl.l);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestColor = candidate;
      }
    }
  }
  return bestColor;
}

// ─── Color Blindness Simulation ─────────────────────────────────
// Matrices from Brettel et al. (1997) / Viénot et al. (1999) simplified
function simulateColorBlindness(rgb: RGB, type: 'protanopia' | 'deuteranopia' | 'tritanopia'): RGB {
  const { r, g, b } = rgb;
  // Convert to linear RGB
  const toLinear = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const toSrgb = (v: number) => {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };

  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);

  let sr: number, sg: number, sb: number;
  switch (type) {
    case 'protanopia':
      sr = 0.152286 * lr + 1.052583 * lg - 0.204868 * lb;
      sg = 0.114503 * lr + 0.786281 * lg + 0.099216 * lb;
      sb = -0.003882 * lr - 0.048116 * lg + 1.051998 * lb;
      break;
    case 'deuteranopia':
      sr = 0.367322 * lr + 0.860646 * lg - 0.227968 * lb;
      sg = 0.280085 * lr + 0.672501 * lg + 0.047413 * lb;
      sb = -0.011820 * lr + 0.042940 * lg + 0.968881 * lb;
      break;
    case 'tritanopia':
      sr = 1.255528 * lr - 0.076749 * lg - 0.178779 * lb;
      sg = -0.078411 * lr + 0.930809 * lg + 0.147602 * lb;
      sb = 0.004733 * lr + 0.691367 * lg + 0.303900 * lb;
      break;
  }

  return {
    r: clamp(Math.round(toSrgb(Math.max(0, sr)) * 255), 0, 255),
    g: clamp(Math.round(toSrgb(Math.max(0, sg)) * 255), 0, 255),
    b: clamp(Math.round(toSrgb(Math.max(0, sb)) * 255), 0, 255),
  };
}

// ─── Storage ────────────────────────────────────────────────────
const STORAGE_KEY = 'contrast-check-state';
function loadState(): { fg: string; bg: string } | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch { return null; }
}
function saveState(fg: string, bg: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ fg, bg }));
}

// ─── Component ──────────────────────────────────────────────────
export default function App() {
  const saved = useRef(loadState());
  const [tab, setTab] = useState<Tab>('checker');
  const [fgHex, setFgHex] = useState(saved.current?.fg || '#1D1D1F');
  const [bgHex, setBgHex] = useState(saved.current?.bg || '#FFFFFF');
  const [fgInputMode, setFgInputMode] = useState<ColorInputMode>('hex');
  const [bgInputMode, setBgInputMode] = useState<ColorInputMode>('hex');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [paletteInput, setPaletteInput] = useState('#1D1D1F\n#6366F1\n#FFFFFF\n#F59E0B\n#EF4444');
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Derived colors
  const fgRgb = hexToRgb(fgHex) || { r: 29, g: 29, b: 31 };
  const bgRgb = hexToRgb(bgHex) || { r: 255, g: 255, b: 255 };
  const fgHsl = rgbToHsl(fgRgb.r, fgRgb.g, fgRgb.b);
  const bgHsl = rgbToHsl(bgRgb.r, bgRgb.g, bgRgb.b);
  const contrastRatio = getContrastRatio(fgRgb, bgRgb);

  // WCAG levels
  const aaNormal = contrastRatio >= 4.5;
  const aaLarge = contrastRatio >= 3;
  const aaaNormal = contrastRatio >= 7;
  const aaaLarge = contrastRatio >= 4.5;

  // Persist
  useEffect(() => { saveState(fgHex, bgHex); }, [fgHex, bgHex]);

  // ─── Color update helpers ────────────────────────────────────
  const updateFgFromRgb = useCallback((rgb: RGB) => {
    setFgHex(rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase());
  }, []);
  const updateBgFromRgb = useCallback((rgb: RGB) => {
    setBgHex(rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase());
  }, []);
  const updateFgFromHsl = useCallback((hsl: HSL) => {
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    setFgHex(rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase());
  }, []);
  const updateBgFromHsl = useCallback((hsl: HSL) => {
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    setBgHex(rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase());
  }, []);

  // ─── Copy ────────────────────────────────────────────────────
  const copyValue = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopiedField(null), 1500);
    trackEvent('contrast_copied', { field: label });
  }, []);

  // ─── Swap ────────────────────────────────────────────────────
  const swapColors = useCallback(() => {
    setFgHex(prev => {
      setBgHex(fgHex);
      return bgHex;
    });
    trackEvent('contrast_swap');
  }, [fgHex, bgHex]);

  // ─── Suggested fixes ─────────────────────────────────────────
  const suggestedFgAA = !aaNormal ? findNearestPassingColor(fgRgb, bgRgb, 4.5, true) : null;
  const suggestedBgAA = !aaNormal ? findNearestPassingColor(bgRgb, fgRgb, 4.5, false) : null;
  const suggestedFgAAA = !aaaNormal ? findNearestPassingColor(fgRgb, bgRgb, 7, true) : null;
  const suggestedBgAAA = !aaaNormal ? findNearestPassingColor(bgRgb, fgRgb, 7, false) : null;

  // ─── Palette checker ─────────────────────────────────────────
  const paletteColors = paletteInput
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => ({ hex: s.startsWith('#') ? s : '#' + s, rgb: hexToRgb(s.startsWith('#') ? s : '#' + s) }))
    .filter(c => c.rgb !== null) as { hex: string; rgb: RGB }[];

  // ─── Contrast ratio scale position ───────────────────────────
  const ratioPercent = Math.min((contrastRatio - 1) / 20 * 100, 100);

  // ─── Color input renderer ────────────────────────────────────
  const renderColorInput = (
    label: string,
    hex: string,
    setHex: (v: string) => void,
    rgb: RGB,
    hsl: HSL,
    updateFromRgb: (rgb: RGB) => void,
    updateFromHsl: (hsl: HSL) => void,
    mode: ColorInputMode,
    setMode: (m: ColorInputMode) => void,
  ) => (
    <div className={styles.colorInput}>
      <div className={styles.colorInputHeader}>
        <label className={styles.colorLabel}>{label}</label>
        <div className={styles.swatchRow}>
          <div className={styles.colorSwatch} style={{ background: hex }} />
          <span className={styles.hexDisplay}>{hex.toUpperCase()}</span>
        </div>
      </div>

      <div className={styles.inputModes}>
        {(['hex', 'rgb', 'hsl', 'picker'] as ColorInputMode[]).map(m => (
          <button
            key={m}
            className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
            onClick={() => setMode(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {mode === 'hex' && (
        <input
          className={styles.hexInput}
          value={hex}
          onChange={e => setHex(e.target.value.toUpperCase())}
          placeholder="#000000"
          spellCheck={false}
        />
      )}

      {mode === 'rgb' && (
        <div className={styles.sliderGroup}>
          {(['r', 'g', 'b'] as const).map(ch => (
            <div key={ch} className={styles.sliderRow}>
              <label className={styles.sliderLabel}>{ch.toUpperCase()}</label>
              <input
                type="range"
                min="0"
                max="255"
                value={rgb[ch]}
                onChange={e => updateFromRgb({ ...rgb, [ch]: Number(e.target.value) })}
                className={styles.slider}
                style={{
                  '--slider-color': ch === 'r' ? '#EF4444' : ch === 'g' ? '#22C55E' : '#3B82F6',
                } as React.CSSProperties}
              />
              <input
                type="number"
                min="0"
                max="255"
                value={rgb[ch]}
                onChange={e => updateFromRgb({ ...rgb, [ch]: clamp(Number(e.target.value) || 0, 0, 255) })}
                className={styles.numInput}
              />
            </div>
          ))}
        </div>
      )}

      {mode === 'hsl' && (
        <div className={styles.sliderGroup}>
          <div className={styles.sliderRow}>
            <label className={styles.sliderLabel}>H</label>
            <input
              type="range"
              min="0"
              max="360"
              value={Math.round(hsl.h)}
              onChange={e => updateFromHsl({ ...hsl, h: Number(e.target.value) })}
              className={`${styles.slider} ${styles.hueSlider}`}
            />
            <input
              type="number"
              min="0"
              max="360"
              value={Math.round(hsl.h)}
              onChange={e => updateFromHsl({ ...hsl, h: clamp(Number(e.target.value) || 0, 0, 360) })}
              className={styles.numInput}
            />
          </div>
          <div className={styles.sliderRow}>
            <label className={styles.sliderLabel}>S</label>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(hsl.s)}
              onChange={e => updateFromHsl({ ...hsl, s: Number(e.target.value) })}
              className={styles.slider}
              style={{ '--slider-color': '#8B5CF6' } as React.CSSProperties}
            />
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(hsl.s)}
              onChange={e => updateFromHsl({ ...hsl, s: clamp(Number(e.target.value) || 0, 0, 100) })}
              className={styles.numInput}
            />
          </div>
          <div className={styles.sliderRow}>
            <label className={styles.sliderLabel}>L</label>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(hsl.l)}
              onChange={e => updateFromHsl({ ...hsl, l: Number(e.target.value) })}
              className={styles.slider}
              style={{ '--slider-color': '#F59E0B' } as React.CSSProperties}
            />
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(hsl.l)}
              onChange={e => updateFromHsl({ ...hsl, l: clamp(Number(e.target.value) || 0, 0, 100) })}
              className={styles.numInput}
            />
          </div>
        </div>
      )}

      {mode === 'picker' && (
        <div className={styles.pickerWrap}>
          <input
            type="color"
            value={hex.length === 7 ? hex : '#000000'}
            onChange={e => setHex(e.target.value.toUpperCase())}
            className={styles.nativePicker}
          />
          <span className={styles.pickerHint}>Click to open color picker</span>
        </div>
      )}
    </div>
  );

  return (
    <Layout title="Contrast Checker">
      <main className={styles.main}>
        {/* Tab navigation */}
        <div className={styles.tabs}>
          {([
            { value: 'checker' as Tab, label: 'Checker' },
            { value: 'blindness' as Tab, label: 'Color Blind' },
            { value: 'palette' as Tab, label: 'Palette' },
          ]).map(t => (
            <button
              key={t.value}
              className={`${styles.tab} ${tab === t.value ? styles.tabActive : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'checker' && (
          <>
            {/* Live Preview */}
            <div
              className={styles.preview}
              style={{ background: bgHex, color: fgHex }}
            >
              <span className={styles.previewLarge}>Large Text Preview (18pt+)</span>
              <span className={styles.previewNormal}>
                Normal text (14px) — The quick brown fox jumps over the lazy dog.
                This text shows how your chosen color combination looks at standard body text size.
              </span>
              <div className={styles.previewButtons}>
                <span className={styles.previewButton} style={{ borderColor: fgHex, color: fgHex }}>Button</span>
                <span className={styles.previewLink} style={{ color: fgHex }}>Link text</span>
              </div>
            </div>

            {/* Contrast Ratio Display */}
            <Card>
              <div className={styles.ratioSection}>
                <div className={styles.ratioDisplay}>
                  <span className={styles.ratioValue}>{contrastRatio.toFixed(2)}</span>
                  <span className={styles.ratioSeparator}>:</span>
                  <span className={styles.ratioValue}>1</span>
                </div>

                {/* Visual scale */}
                <div className={styles.ratioScale}>
                  <div className={styles.ratioBar}>
                    <div className={styles.ratioFill} style={{ width: `${ratioPercent}%` }} />
                    <div className={styles.ratioMarker} style={{ left: '14.3%' }} title="3:1 AA Large" />
                    <div className={styles.ratioMarker} style={{ left: '21.4%' }} title="4.5:1 AA" />
                    <div className={styles.ratioMarker} style={{ left: '35.7%' }} title="7:1 AAA" />
                  </div>
                  <div className={styles.ratioLabels}>
                    <span>1:1</span>
                    <span>3:1</span>
                    <span>4.5:1</span>
                    <span>7:1</span>
                    <span>21:1</span>
                  </div>
                </div>

                {/* WCAG Results */}
                <div className={styles.wcagGrid}>
                  <div className={`${styles.wcagResult} ${aaNormal ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagIcon}>{aaNormal ? '✓' : '✕'}</span>
                    <div className={styles.wcagInfo}>
                      <span className={styles.wcagLevel}>AA Normal</span>
                      <span className={styles.wcagReq}>≥ 4.5:1</span>
                    </div>
                  </div>
                  <div className={`${styles.wcagResult} ${aaLarge ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagIcon}>{aaLarge ? '✓' : '✕'}</span>
                    <div className={styles.wcagInfo}>
                      <span className={styles.wcagLevel}>AA Large</span>
                      <span className={styles.wcagReq}>≥ 3:1</span>
                    </div>
                  </div>
                  <div className={`${styles.wcagResult} ${aaaNormal ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagIcon}>{aaaNormal ? '✓' : '✕'}</span>
                    <div className={styles.wcagInfo}>
                      <span className={styles.wcagLevel}>AAA Normal</span>
                      <span className={styles.wcagReq}>≥ 7:1</span>
                    </div>
                  </div>
                  <div className={`${styles.wcagResult} ${aaaLarge ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagIcon}>{aaaLarge ? '✓' : '✕'}</span>
                    <div className={styles.wcagInfo}>
                      <span className={styles.wcagLevel}>AAA Large</span>
                      <span className={styles.wcagReq}>≥ 4.5:1</span>
                    </div>
                  </div>
                </div>

                {/* Copy results */}
                <button
                  className={`${styles.copyBtn} ${copiedField === 'results' ? styles.copyBtnDone : ''}`}
                  onClick={() => {
                    const text = `Contrast Ratio: ${contrastRatio.toFixed(2)}:1\nAA Normal: ${aaNormal ? 'PASS' : 'FAIL'}\nAA Large: ${aaLarge ? 'PASS' : 'FAIL'}\nAAA Normal: ${aaaNormal ? 'PASS' : 'FAIL'}\nAAA Large: ${aaaLarge ? 'PASS' : 'FAIL'}\nForeground: ${fgHex}\nBackground: ${bgHex}`;
                    copyValue('results', text);
                  }}
                >
                  {copiedField === 'results' ? '✓ Copied!' : 'Copy Results'}
                </button>
              </div>
            </Card>

            {/* Color Inputs */}
            <Card>
              <div className={styles.colorInputs}>
                {renderColorInput('Foreground (Text)', fgHex, setFgHex, fgRgb, fgHsl, updateFgFromRgb, updateFgFromHsl, fgInputMode, setFgInputMode)}
                <button className={styles.swapBtn} onClick={swapColors} title="Swap colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
                {renderColorInput('Background', bgHex, setBgHex, bgRgb, bgHsl, updateBgFromRgb, updateBgFromHsl, bgInputMode, setBgInputMode)}
              </div>
            </Card>

            {/* Suggested Fixes */}
            {!aaNormal && (
              <Card>
                <div className={styles.suggestSection}>
                  <span className={styles.sectionTitle}>Suggested Fixes</span>
                  <p className={styles.suggestDesc}>Nearest colors that meet WCAG requirements:</p>

                  {suggestedFgAA && (
                    <div className={styles.suggestRow}>
                      <span className={styles.suggestLabel}>AA (4.5:1) — Adjust text:</span>
                      <button
                        className={styles.suggestColor}
                        style={{ background: rgbToHex(suggestedFgAA.r, suggestedFgAA.g, suggestedFgAA.b) }}
                        onClick={() => {
                          setFgHex(rgbToHex(suggestedFgAA.r, suggestedFgAA.g, suggestedFgAA.b).toUpperCase());
                          trackEvent('contrast_apply_suggestion', { level: 'AA', target: 'fg' });
                        }}
                        title="Click to apply"
                      >
                        <span style={{ color: rgbToHex(suggestedFgAA.r, suggestedFgAA.g, suggestedFgAA.b), mixBlendMode: 'difference' }}>
                          {rgbToHex(suggestedFgAA.r, suggestedFgAA.g, suggestedFgAA.b).toUpperCase()}
                        </span>
                      </button>
                    </div>
                  )}
                  {suggestedBgAA && (
                    <div className={styles.suggestRow}>
                      <span className={styles.suggestLabel}>AA (4.5:1) — Adjust background:</span>
                      <button
                        className={styles.suggestColor}
                        style={{ background: rgbToHex(suggestedBgAA.r, suggestedBgAA.g, suggestedBgAA.b) }}
                        onClick={() => {
                          setBgHex(rgbToHex(suggestedBgAA.r, suggestedBgAA.g, suggestedBgAA.b).toUpperCase());
                          trackEvent('contrast_apply_suggestion', { level: 'AA', target: 'bg' });
                        }}
                        title="Click to apply"
                      >
                        <span style={{ color: rgbToHex(suggestedBgAA.r, suggestedBgAA.g, suggestedBgAA.b), mixBlendMode: 'difference' }}>
                          {rgbToHex(suggestedBgAA.r, suggestedBgAA.g, suggestedBgAA.b).toUpperCase()}
                        </span>
                      </button>
                    </div>
                  )}
                  {!aaaNormal && suggestedFgAAA && (
                    <div className={styles.suggestRow}>
                      <span className={styles.suggestLabel}>AAA (7:1) — Adjust text:</span>
                      <button
                        className={styles.suggestColor}
                        style={{ background: rgbToHex(suggestedFgAAA.r, suggestedFgAAA.g, suggestedFgAAA.b) }}
                        onClick={() => {
                          setFgHex(rgbToHex(suggestedFgAAA.r, suggestedFgAAA.g, suggestedFgAAA.b).toUpperCase());
                          trackEvent('contrast_apply_suggestion', { level: 'AAA', target: 'fg' });
                        }}
                        title="Click to apply"
                      >
                        <span style={{ color: rgbToHex(suggestedFgAAA.r, suggestedFgAAA.g, suggestedFgAAA.b), mixBlendMode: 'difference' }}>
                          {rgbToHex(suggestedFgAAA.r, suggestedFgAAA.g, suggestedFgAAA.b).toUpperCase()}
                        </span>
                      </button>
                    </div>
                  )}
                  {!aaaNormal && suggestedBgAAA && (
                    <div className={styles.suggestRow}>
                      <span className={styles.suggestLabel}>AAA (7:1) — Adjust background:</span>
                      <button
                        className={styles.suggestColor}
                        style={{ background: rgbToHex(suggestedBgAAA.r, suggestedBgAAA.g, suggestedBgAAA.b) }}
                        onClick={() => {
                          setBgHex(rgbToHex(suggestedBgAAA.r, suggestedBgAAA.g, suggestedBgAAA.b).toUpperCase());
                          trackEvent('contrast_apply_suggestion', { level: 'AAA', target: 'bg' });
                        }}
                        title="Click to apply"
                      >
                        <span style={{ color: rgbToHex(suggestedBgAAA.r, suggestedBgAAA.g, suggestedBgAAA.b), mixBlendMode: 'difference' }}>
                          {rgbToHex(suggestedBgAAA.r, suggestedBgAAA.g, suggestedBgAAA.b).toUpperCase()}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </>
        )}

        {tab === 'blindness' && (
          <>
            <Card>
              <div className={styles.blindSection}>
                <span className={styles.sectionTitle}>Color Blindness Simulation</span>
                <p className={styles.blindDesc}>
                  See how your color combination appears to people with different types of color vision deficiency.
                </p>

                {/* Original */}
                <div className={styles.blindCard}>
                  <div className={styles.blindLabel}>Normal Vision</div>
                  <div
                    className={styles.blindPreview}
                    style={{ background: bgHex, color: fgHex }}
                  >
                    <span className={styles.blindTextLarge}>Large Text</span>
                    <span className={styles.blindTextNormal}>Normal body text sample</span>
                  </div>
                  <div className={styles.blindRatio}>{contrastRatio.toFixed(2)}:1</div>
                </div>

                {/* Simulations */}
                {([
                  { type: 'protanopia' as const, name: 'Protanopia', desc: 'Red-blind (~1% of males)' },
                  { type: 'deuteranopia' as const, name: 'Deuteranopia', desc: 'Green-blind (~6% of males)' },
                  { type: 'tritanopia' as const, name: 'Tritanopia', desc: 'Blue-blind (~0.01%)' },
                ]).map(sim => {
                  const simFg = simulateColorBlindness(fgRgb, sim.type);
                  const simBg = simulateColorBlindness(bgRgb, sim.type);
                  const simRatio = getContrastRatio(simFg, simBg);
                  const simFgHex = rgbToHex(simFg.r, simFg.g, simFg.b);
                  const simBgHex = rgbToHex(simBg.r, simBg.g, simBg.b);

                  return (
                    <div key={sim.type} className={styles.blindCard}>
                      <div className={styles.blindLabel}>
                        {sim.name}
                        <span className={styles.blindLabelDesc}>{sim.desc}</span>
                      </div>
                      <div
                        className={styles.blindPreview}
                        style={{ background: simBgHex, color: simFgHex }}
                      >
                        <span className={styles.blindTextLarge}>Large Text</span>
                        <span className={styles.blindTextNormal}>Normal body text sample</span>
                      </div>
                      <div className={styles.blindMeta}>
                        <span className={`${styles.blindRatio} ${simRatio >= 4.5 ? styles.blindPass : styles.blindFail}`}>
                          {simRatio.toFixed(2)}:1
                        </span>
                        <span className={styles.blindColors}>
                          {simFgHex.toUpperCase()} on {simBgHex.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {tab === 'palette' && (
          <>
            <Card>
              <div className={styles.paletteSection}>
                <span className={styles.sectionTitle}>Palette Contrast Matrix</span>
                <p className={styles.paletteDesc}>
                  Enter multiple colors (one per line or comma-separated) to see the contrast ratio between all pairs.
                </p>
                <textarea
                  className={styles.paletteTextarea}
                  value={paletteInput}
                  onChange={e => setPaletteInput(e.target.value)}
                  placeholder="#000000&#10;#6366F1&#10;#FFFFFF"
                  rows={5}
                  spellCheck={false}
                />
              </div>
            </Card>

            {paletteColors.length >= 2 && (
              <Card>
                <div className={styles.matrixSection}>
                  <span className={styles.sectionTitle}>Contrast Matrix</span>
                  <div className={styles.matrixScroll}>
                    <table className={styles.matrix}>
                      <thead>
                        <tr>
                          <th className={styles.matrixCorner}>FG ↓ / BG →</th>
                          {paletteColors.map((c, i) => (
                            <th key={i} className={styles.matrixHeader}>
                              <div className={styles.matrixHeaderSwatch} style={{ background: c.hex }} />
                              <span className={styles.matrixHeaderHex}>{c.hex.toUpperCase()}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paletteColors.map((row, ri) => (
                          <tr key={ri}>
                            <td className={styles.matrixRowHeader}>
                              <div className={styles.matrixHeaderSwatch} style={{ background: row.hex }} />
                              <span className={styles.matrixHeaderHex}>{row.hex.toUpperCase()}</span>
                            </td>
                            {paletteColors.map((col, ci) => {
                              if (ri === ci) return <td key={ci} className={styles.matrixSelf}>—</td>;
                              const ratio = getContrastRatio(row.rgb!, col.rgb!);
                              const level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Lg' : 'Fail';
                              const isPass = ratio >= 4.5;
                              return (
                                <td
                                  key={ci}
                                  className={`${styles.matrixCell} ${isPass ? styles.matrixPass : ratio >= 3 ? styles.matrixWarn : styles.matrixFail}`}
                                  title={`${row.hex} on ${col.hex}: ${ratio.toFixed(2)}:1 (${level})`}
                                  onClick={() => {
                                    setFgHex(row.hex.toUpperCase());
                                    setBgHex(col.hex.toUpperCase());
                                    setTab('checker');
                                  }}
                                >
                                  <div className={styles.matrixCellPreview} style={{ background: col.hex, color: row.hex }}>
                                    Aa
                                  </div>
                                  <span className={styles.matrixRatio}>{ratio.toFixed(1)}:1</span>
                                  <span className={`${styles.matrixBadge} ${isPass ? styles.matrixBadgePass : ratio >= 3 ? styles.matrixBadgeWarn : styles.matrixBadgeFail}`}>
                                    {level}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.matrixHint}>Click any cell to check that combination in the Checker tab.</p>
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
