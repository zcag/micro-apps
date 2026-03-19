import { useState, useCallback, useRef, useEffect } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

// ─── Color Types ─────────────────────────────────────────────────
interface RGB { r: number; g: number; b: number; }
interface HSL { h: number; s: number; l: number; }
interface HSV { h: number; s: number; v: number; }
interface CMYK { c: number; m: number; y: number; k: number; }

// ─── Color Conversion Functions ──────────────────────────────────
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): RGB | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) {
    const m3 = hex.replace('#', '').match(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (!m3) return null;
    return { r: parseInt(m3[1]+m3[1], 16), g: parseInt(m3[2]+m3[2], 16), b: parseInt(m3[3]+m3[3], 16) };
  }
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
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

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  if (max === min) return { h: 0, s: s * 100, v: v * 100 };
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, v: v * 100 };
}

function hsvToRgb(h: number, s: number, v: number): RGB {
  h /= 360; s /= 100; v /= 100;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToCmyk(r: number, g: number, b: number): CMYK {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - r - k) / (1 - k)) * 100,
    m: ((1 - g - k) / (1 - k)) * 100,
    y: ((1 - b - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  c /= 100; m /= 100; y /= 100; k /= 100;
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(rgb1: RGB, rgb2: RGB): number {
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function textColorForBg(r: number, g: number, b: number): string {
  return getLuminance(r, g, b) > 0.179 ? '#000000' : '#ffffff';
}

// ─── Named CSS Colors ────────────────────────────────────────────
const CSS_COLORS: [string, string][] = [
  ['AliceBlue','#F0F8FF'],['AntiqueWhite','#FAEBD7'],['Aqua','#00FFFF'],['Aquamarine','#7FFFD4'],
  ['Azure','#F0FFFF'],['Beige','#F5F5DC'],['Bisque','#FFE4C4'],['Black','#000000'],
  ['BlanchedAlmond','#FFEBCD'],['Blue','#0000FF'],['BlueViolet','#8A2BE2'],['Brown','#A52A2A'],
  ['BurlyWood','#DEB887'],['CadetBlue','#5F9EA0'],['Chartreuse','#7FFF00'],['Chocolate','#D2691E'],
  ['Coral','#FF7F50'],['CornflowerBlue','#6495ED'],['Cornsilk','#FFF8DC'],['Crimson','#DC143C'],
  ['Cyan','#00FFFF'],['DarkBlue','#00008B'],['DarkCyan','#008B8B'],['DarkGoldenRod','#B8860B'],
  ['DarkGray','#A9A9A9'],['DarkGreen','#006400'],['DarkKhaki','#BDB76B'],['DarkMagenta','#8B008B'],
  ['DarkOliveGreen','#556B2F'],['DarkOrange','#FF8C00'],['DarkOrchid','#9932CC'],['DarkRed','#8B0000'],
  ['DarkSalmon','#E9967A'],['DarkSeaGreen','#8FBC8F'],['DarkSlateBlue','#483D8B'],['DarkSlateGray','#2F4F4F'],
  ['DarkTurquoise','#00CED1'],['DarkViolet','#9400D3'],['DeepPink','#FF1493'],['DeepSkyBlue','#00BFFF'],
  ['DimGray','#696969'],['DodgerBlue','#1E90FF'],['FireBrick','#B22222'],['FloralWhite','#FFFAF0'],
  ['ForestGreen','#228B22'],['Fuchsia','#FF00FF'],['Gainsboro','#DCDCDC'],['GhostWhite','#F8F8FF'],
  ['Gold','#FFD700'],['GoldenRod','#DAA520'],['Gray','#808080'],['Green','#008000'],
  ['GreenYellow','#ADFF2F'],['HoneyDew','#F0FFF0'],['HotPink','#FF69B4'],['IndianRed','#CD5C5C'],
  ['Indigo','#4B0082'],['Ivory','#FFFFF0'],['Khaki','#F0E68C'],['Lavender','#E6E6FA'],
  ['LavenderBlush','#FFF0F5'],['LawnGreen','#7CFC00'],['LemonChiffon','#FFFACD'],['LightBlue','#ADD8E6'],
  ['LightCoral','#F08080'],['LightCyan','#E0FFFF'],['LightGoldenRodYellow','#FAFAD2'],['LightGray','#D3D3D3'],
  ['LightGreen','#90EE90'],['LightPink','#FFB6C1'],['LightSalmon','#FFA07A'],['LightSeaGreen','#20B2AA'],
  ['LightSkyBlue','#87CEFA'],['LightSlateGray','#778899'],['LightSteelBlue','#B0C4DE'],['LightYellow','#FFFFE0'],
  ['Lime','#00FF00'],['LimeGreen','#32CD32'],['Linen','#FAF0E6'],['Magenta','#FF00FF'],
  ['Maroon','#800000'],['MediumAquaMarine','#66CDAA'],['MediumBlue','#0000CD'],['MediumOrchid','#BA55D3'],
  ['MediumPurple','#9370DB'],['MediumSeaGreen','#3CB371'],['MediumSlateBlue','#7B68EE'],['MediumSpringGreen','#00FA9A'],
  ['MediumTurquoise','#48D1CC'],['MediumVioletRed','#C71585'],['MidnightBlue','#191970'],['MintCream','#F5FFFA'],
  ['MistyRose','#FFE4E1'],['Moccasin','#FFE4B5'],['NavajoWhite','#FFDEAD'],['Navy','#000080'],
  ['OldLace','#FDF5E6'],['Olive','#808000'],['OliveDrab','#6B8E23'],['Orange','#FFA500'],
  ['OrangeRed','#FF4500'],['Orchid','#DA70D6'],['PaleGoldenRod','#EEE8AA'],['PaleGreen','#98FB98'],
  ['PaleTurquoise','#AFEEEE'],['PaleVioletRed','#DB7093'],['PapayaWhip','#FFEFD5'],['PeachPuff','#FFDAB9'],
  ['Peru','#CD853F'],['Pink','#FFC0CB'],['Plum','#DDA0DD'],['PowderBlue','#B0E0E6'],
  ['Purple','#800080'],['RebeccaPurple','#663399'],['Red','#FF0000'],['RosyBrown','#BC8F8F'],
  ['RoyalBlue','#4169E1'],['SaddleBrown','#8B4513'],['Salmon','#FA8072'],['SandyBrown','#F4A460'],
  ['SeaGreen','#2E8B57'],['SeaShell','#FFF5EE'],['Sienna','#A0522D'],['Silver','#C0C0C0'],
  ['SkyBlue','#87CEEB'],['SlateBlue','#6A5ACD'],['SlateGray','#708090'],['Snow','#FFFAFA'],
  ['SpringGreen','#00FF7F'],['SteelBlue','#4682B4'],['Tan','#D2B48C'],['Teal','#008080'],
  ['Thistle','#D8BFD8'],['Tomato','#FF6347'],['Turquoise','#40E0D0'],['Violet','#EE82EE'],
  ['Wheat','#F5DEB3'],['White','#FFFFFF'],['WhiteSmoke','#F5F5F5'],['Yellow','#FFFF00'],
  ['YellowGreen','#9ACD32'],
];

// ─── History Helper ──────────────────────────────────────────────
const HISTORY_KEY = 'color-convert-history';
function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(history: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// ─── Tabs ────────────────────────────────────────────────────────
type Tab = 'picker' | 'contrast' | 'named';

export default function App() {
  const [rgb, setRgb] = useState<RGB>({ r: 233, g: 30, b: 99 });
  const [hexInput, setHexInput] = useState('#E91E63');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('picker');
  const [cssSearch, setCssSearch] = useState('');

  // Contrast checker state
  const [fgHex, setFgHex] = useState('#000000');
  const [bgHex, setBgHex] = useState('#FFFFFF');

  const pickerRef = useRef<HTMLDivElement>(null);
  const isDraggingPicker = useRef(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Derived color values
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
  const txtColor = textColorForBg(rgb.r, rgb.g, rgb.b);

  // Update color from RGB
  const updateFromRgb = useCallback((newRgb: RGB) => {
    setRgb(newRgb);
    setHexInput(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  }, []);

  // Add to history
  const addToHistory = useCallback((hexVal: string) => {
    setHistory(prev => {
      const next = [hexVal, ...prev.filter(h => h !== hexVal)].slice(0, 20);
      saveHistory(next);
      return next;
    });
  }, []);

  // ─── Picker Interaction ────────────────────────────────────────
  const handlePickerInteraction = useCallback((clientX: number, clientY: number) => {
    const el = pickerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
    const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * 100;
    const newRgb = hsvToRgb(hsv.h, s, v);
    updateFromRgb(newRgb);
  }, [hsv.h, updateFromRgb]);

  const onPickerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDraggingPicker.current = true;
    const point = 'touches' in e ? e.touches[0] : e;
    handlePickerInteraction(point.clientX, point.clientY);
  }, [handlePickerInteraction]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingPicker.current) return;
      e.preventDefault();
      const point = 'touches' in e ? e.touches[0] : e;
      handlePickerInteraction(point.clientX, point.clientY);
    };
    const onUp = () => {
      if (isDraggingPicker.current) {
        isDraggingPicker.current = false;
        addToHistory(rgbToHex(rgb.r, rgb.g, rgb.b));
        trackEvent('color_picked', { hex });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [handlePickerInteraction, addToHistory, rgb, hex]);

  // ─── Hue Slider ───────────────────────────────────────────────
  const onHueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const h = Number(e.target.value);
    const newRgb = hsvToRgb(h, hsv.s, hsv.v);
    updateFromRgb(newRgb);
  }, [hsv.s, hsv.v, updateFromRgb]);

  // ─── Input Handlers ───────────────────────────────────────────
  const onHexChange = useCallback((val: string) => {
    setHexInput(val);
    const parsed = hexToRgb(val);
    if (parsed) {
      setRgb(parsed);
      addToHistory(rgbToHex(parsed.r, parsed.g, parsed.b));
    }
  }, [addToHistory]);

  const onRgbFieldChange = useCallback((field: 'r' | 'g' | 'b', val: string) => {
    const n = clamp(Number(val) || 0, 0, 255);
    const newRgb = { ...rgb, [field]: n };
    updateFromRgb(newRgb);
  }, [rgb, updateFromRgb]);

  const onHslFieldChange = useCallback((field: 'h' | 's' | 'l', val: string) => {
    const max = field === 'h' ? 360 : 100;
    const n = clamp(Number(val) || 0, 0, max);
    const newHsl = { ...hsl, [field]: n };
    const newRgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    updateFromRgb(newRgb);
  }, [hsl, updateFromRgb]);

  const onHsvFieldChange = useCallback((field: 'h' | 's' | 'v', val: string) => {
    const max = field === 'h' ? 360 : 100;
    const n = clamp(Number(val) || 0, 0, max);
    const newHsv = { ...hsv, [field]: n };
    const newRgb = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
    updateFromRgb(newRgb);
  }, [hsv, updateFromRgb]);

  const onCmykFieldChange = useCallback((field: 'c' | 'm' | 'y' | 'k', val: string) => {
    const n = clamp(Number(val) || 0, 0, 100);
    const newCmyk = { ...cmyk, [field]: n };
    const newRgb = cmykToRgb(newCmyk.c, newCmyk.m, newCmyk.y, newCmyk.k);
    updateFromRgb(newRgb);
  }, [cmyk, updateFromRgb]);

  // ─── Copy ─────────────────────────────────────────────────────
  const copyValue = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopiedField(null), 1500);
    trackEvent('color_copied', { format: label });
  }, []);

  // ─── Contrast ─────────────────────────────────────────────────
  const fgRgb = hexToRgb(fgHex) || { r: 0, g: 0, b: 0 };
  const bgRgb = hexToRgb(bgHex) || { r: 255, g: 255, b: 255 };
  const contrastRatio = getContrastRatio(fgRgb, bgRgb);
  const aaLargePass = contrastRatio >= 3;
  const aaNormalPass = contrastRatio >= 4.5;
  const aaaLargePass = contrastRatio >= 4.5;
  const aaaNormalPass = contrastRatio >= 7;

  // ─── CSS Colors Filter ────────────────────────────────────────
  const filteredCss = cssSearch
    ? CSS_COLORS.filter(([name, hex]) =>
        name.toLowerCase().includes(cssSearch.toLowerCase()) ||
        hex.toLowerCase().includes(cssSearch.toLowerCase())
      )
    : CSS_COLORS;

  // ─── Format Strings ───────────────────────────────────────────
  const hexStr = hex.toUpperCase();
  const rgbStr = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const hslStr = `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
  const hsvStr = `hsv(${Math.round(hsv.h)}, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%)`;
  const cmykStr = `cmyk(${Math.round(cmyk.c)}%, ${Math.round(cmyk.m)}%, ${Math.round(cmyk.y)}%, ${Math.round(cmyk.k)}%)`;

  return (
    <Layout title="Color Picker & Converter">
      <main className={styles.main}>
        {/* Tab navigation */}
        <div className={styles.tabs}>
          {(['picker', 'contrast', 'named'] as Tab[]).map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
              style={tab === t ? { borderColor: hex, color: hex } : undefined}
            >
              {t === 'picker' ? 'Picker' : t === 'contrast' ? 'Contrast' : 'CSS Colors'}
            </button>
          ))}
        </div>

        {tab === 'picker' && (
          <>
            {/* Color Swatch */}
            <div
              className={styles.swatch}
              style={{ background: hex, color: txtColor, transition: 'background 0.15s ease, color 0.15s ease' }}
            >
              <span className={styles.swatchHex}>{hexStr}</span>
              <span className={styles.swatchLabel}>{rgbStr}</span>
            </div>

            {/* SV Picker */}
            <Card>
              <div className={styles.pickerSection}>
                <div
                  ref={pickerRef}
                  className={styles.svPicker}
                  style={{ background: `hsl(${Math.round(hsv.h)}, 100%, 50%)` }}
                  onMouseDown={onPickerDown}
                  onTouchStart={onPickerDown}
                >
                  <div className={styles.svWhite} />
                  <div className={styles.svBlack} />
                  <div
                    className={styles.svCursor}
                    style={{
                      left: `${hsv.s}%`,
                      top: `${100 - hsv.v}%`,
                      borderColor: txtColor,
                    }}
                  />
                </div>
                <div className={styles.hueSliderWrap}>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={Math.round(hsv.h)}
                    onChange={onHueChange}
                    className={styles.hueSlider}
                  />
                </div>
              </div>
            </Card>

            {/* Format Inputs */}
            <Card>
              <div className={styles.formatSection}>
                {/* HEX */}
                <div className={styles.formatRow}>
                  <label className={styles.formatLabel}>HEX</label>
                  <div className={styles.formatInputs}>
                    <input
                      className={styles.formatInput}
                      value={hexInput}
                      onChange={e => onHexChange(e.target.value)}
                      onBlur={() => setHexInput(hex.toUpperCase())}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedField === 'hex' ? styles.copied : ''}`}
                    onClick={() => copyValue('hex', hexStr)}
                  >
                    {copiedField === 'hex' ? '✓' : '⎘'}
                  </button>
                </div>

                {/* RGB */}
                <div className={styles.formatRow}>
                  <label className={styles.formatLabel}>RGB</label>
                  <div className={styles.formatInputs}>
                    {(['r', 'g', 'b'] as const).map(f => (
                      <input
                        key={f}
                        className={styles.formatInput}
                        type="number"
                        min="0"
                        max="255"
                        value={rgb[f]}
                        onChange={e => onRgbFieldChange(f, e.target.value)}
                        onBlur={() => addToHistory(hex)}
                      />
                    ))}
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedField === 'rgb' ? styles.copied : ''}`}
                    onClick={() => copyValue('rgb', rgbStr)}
                  >
                    {copiedField === 'rgb' ? '✓' : '⎘'}
                  </button>
                </div>

                {/* HSL */}
                <div className={styles.formatRow}>
                  <label className={styles.formatLabel}>HSL</label>
                  <div className={styles.formatInputs}>
                    {(['h', 's', 'l'] as const).map(f => (
                      <input
                        key={f}
                        className={styles.formatInput}
                        type="number"
                        min="0"
                        max={f === 'h' ? 360 : 100}
                        value={Math.round(hsl[f])}
                        onChange={e => onHslFieldChange(f, e.target.value)}
                        onBlur={() => addToHistory(hex)}
                      />
                    ))}
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedField === 'hsl' ? styles.copied : ''}`}
                    onClick={() => copyValue('hsl', hslStr)}
                  >
                    {copiedField === 'hsl' ? '✓' : '⎘'}
                  </button>
                </div>

                {/* HSV/HSB */}
                <div className={styles.formatRow}>
                  <label className={styles.formatLabel}>HSV</label>
                  <div className={styles.formatInputs}>
                    {(['h', 's', 'v'] as const).map(f => (
                      <input
                        key={f}
                        className={styles.formatInput}
                        type="number"
                        min="0"
                        max={f === 'h' ? 360 : 100}
                        value={Math.round(hsv[f])}
                        onChange={e => onHsvFieldChange(f, e.target.value)}
                        onBlur={() => addToHistory(hex)}
                      />
                    ))}
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedField === 'hsv' ? styles.copied : ''}`}
                    onClick={() => copyValue('hsv', hsvStr)}
                  >
                    {copiedField === 'hsv' ? '✓' : '⎘'}
                  </button>
                </div>

                {/* CMYK */}
                <div className={styles.formatRow}>
                  <label className={styles.formatLabel}>CMYK</label>
                  <div className={styles.formatInputs}>
                    {(['c', 'm', 'y', 'k'] as const).map(f => (
                      <input
                        key={f}
                        className={styles.formatInput}
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(cmyk[f])}
                        onChange={e => onCmykFieldChange(f, e.target.value)}
                        onBlur={() => addToHistory(hex)}
                      />
                    ))}
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedField === 'cmyk' ? styles.copied : ''}`}
                    onClick={() => copyValue('cmyk', cmykStr)}
                  >
                    {copiedField === 'cmyk' ? '✓' : '⎘'}
                  </button>
                </div>
              </div>
            </Card>

            {/* Color History */}
            {history.length > 0 && (
              <Card>
                <div className={styles.historySection}>
                  <div className={styles.historyHeader}>
                    <span className={styles.sectionTitle}>Recent Colors</span>
                    <button
                      className={styles.clearBtn}
                      onClick={() => { setHistory([]); saveHistory([]); }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className={styles.historyGrid}>
                    {history.map((h, i) => (
                      <button
                        key={`${h}-${i}`}
                        className={styles.historyItem}
                        style={{ background: h }}
                        title={h.toUpperCase()}
                        onClick={() => {
                          const parsed = hexToRgb(h);
                          if (parsed) updateFromRgb(parsed);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {tab === 'contrast' && (
          <>
            {/* Contrast Checker */}
            <Card>
              <div className={styles.contrastSection}>
                <span className={styles.sectionTitle}>WCAG Contrast Checker</span>

                <div className={styles.contrastInputs}>
                  <div className={styles.contrastField}>
                    <label className={styles.contrastLabel}>Foreground</label>
                    <div className={styles.contrastInputRow}>
                      <div
                        className={styles.contrastSwatch}
                        style={{ background: fgHex }}
                      />
                      <input
                        className={styles.formatInput}
                        value={fgHex}
                        onChange={e => setFgHex(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => { setFgHex(hex.toUpperCase()); }}
                    >
                      Use Current Color
                    </Button>
                  </div>

                  <div className={styles.contrastField}>
                    <label className={styles.contrastLabel}>Background</label>
                    <div className={styles.contrastInputRow}>
                      <div
                        className={styles.contrastSwatch}
                        style={{ background: bgHex }}
                      />
                      <input
                        className={styles.formatInput}
                        value={bgHex}
                        onChange={e => setBgHex(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => { setBgHex(hex.toUpperCase()); }}
                    >
                      Use Current Color
                    </Button>
                  </div>
                </div>

                {/* Preview */}
                <div
                  className={styles.contrastPreview}
                  style={{ background: bgHex, color: fgHex }}
                >
                  <span className={styles.contrastPreviewLarge}>Large Text (18pt+)</span>
                  <span className={styles.contrastPreviewNormal}>Normal text — the quick brown fox jumps over the lazy dog.</span>
                </div>

                {/* Ratio */}
                <div className={styles.contrastRatio}>
                  <span className={styles.ratioValue}>{contrastRatio.toFixed(2)}:1</span>
                </div>

                {/* Results */}
                <div className={styles.contrastResults}>
                  <div className={`${styles.wcagResult} ${aaNormalPass ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagLabel}>AA Normal</span>
                    <span className={styles.wcagStatus}>{aaNormalPass ? 'PASS' : 'FAIL'}</span>
                  </div>
                  <div className={`${styles.wcagResult} ${aaLargePass ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagLabel}>AA Large</span>
                    <span className={styles.wcagStatus}>{aaLargePass ? 'PASS' : 'FAIL'}</span>
                  </div>
                  <div className={`${styles.wcagResult} ${aaaNormalPass ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagLabel}>AAA Normal</span>
                    <span className={styles.wcagStatus}>{aaaNormalPass ? 'PASS' : 'FAIL'}</span>
                  </div>
                  <div className={`${styles.wcagResult} ${aaaLargePass ? styles.pass : styles.fail}`}>
                    <span className={styles.wcagLabel}>AAA Large</span>
                    <span className={styles.wcagStatus}>{aaaLargePass ? 'PASS' : 'FAIL'}</span>
                  </div>
                </div>

                <button
                  className={styles.swapBtn}
                  onClick={() => { const tmp = fgHex; setFgHex(bgHex); setBgHex(tmp); }}
                >
                  ⇄ Swap Colors
                </button>
              </div>
            </Card>
          </>
        )}

        {tab === 'named' && (
          <Card>
            <div className={styles.namedSection}>
              <span className={styles.sectionTitle}>CSS Named Colors</span>
              <input
                className={styles.cssSearch}
                placeholder="Search colors..."
                value={cssSearch}
                onChange={e => setCssSearch(e.target.value)}
              />
              <div className={styles.cssGrid}>
                {filteredCss.map(([name, hexVal]) => (
                  <button
                    key={name}
                    className={styles.cssItem}
                    onClick={() => {
                      const parsed = hexToRgb(hexVal);
                      if (parsed) {
                        updateFromRgb(parsed);
                        addToHistory(hexVal);
                        setTab('picker');
                        trackEvent('css_color_selected', { name });
                      }
                    }}
                  >
                    <div
                      className={styles.cssItemSwatch}
                      style={{ background: hexVal }}
                    />
                    <span className={styles.cssItemName}>{name}</span>
                    <span className={styles.cssItemHex}>{hexVal}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}
      </main>
    </Layout>
  );
}
