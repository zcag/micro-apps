// ─── Types ──────────────────────────────────────────────────────
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type CVDType =
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'protanomaly'
  | 'deuteranomaly'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly';

export interface CVDInfo {
  type: CVDType;
  name: string;
  description: string;
  prevalence: string;
  affected: string;
  category: 'red-green' | 'blue-yellow' | 'total';
}

// ─── CVD Type Metadata ──────────────────────────────────────────
export const CVD_TYPES: CVDInfo[] = [
  {
    type: 'protanopia',
    name: 'Protanopia',
    description: 'No red cones. Red appears dark. Confuses red with black, dark brown, and dark green.',
    prevalence: '~1.3%',
    affected: '~1% of males',
    category: 'red-green',
  },
  {
    type: 'deuteranopia',
    name: 'Deuteranopia',
    description: 'No green cones. The most common form. Confuses greens, yellows, and reds.',
    prevalence: '~1.2%',
    affected: '~1% of males',
    category: 'red-green',
  },
  {
    type: 'tritanopia',
    name: 'Tritanopia',
    description: 'No blue cones. Very rare. Confuses blue with green and yellow with violet.',
    prevalence: '~0.001%',
    affected: '~0.01% of population',
    category: 'blue-yellow',
  },
  {
    type: 'protanomaly',
    name: 'Protanomaly',
    description: 'Weak red cones. Red, orange, and yellow appear shifted toward green.',
    prevalence: '~1.3%',
    affected: '~1% of males',
    category: 'red-green',
  },
  {
    type: 'deuteranomaly',
    name: 'Deuteranomaly',
    description: 'Weak green cones. Most common CVD overall. Greens appear more red.',
    prevalence: '~5.0%',
    affected: '~5% of males, ~0.4% of females',
    category: 'red-green',
  },
  {
    type: 'tritanomaly',
    name: 'Tritanomaly',
    description: 'Weak blue cones. Extremely rare. Blues appear greener, yellows appear lighter.',
    prevalence: '~0.01%',
    affected: '~0.01% of population',
    category: 'blue-yellow',
  },
  {
    type: 'achromatopsia',
    name: 'Achromatopsia',
    description: 'Total color blindness. Sees only shades of gray. Extremely rare.',
    prevalence: '~0.003%',
    affected: '~1 in 33,000',
    category: 'total',
  },
  {
    type: 'achromatomaly',
    name: 'Achromatomaly',
    description: 'Weak total color vision. Colors are very muted, almost monochromatic.',
    prevalence: '~0.001%',
    affected: 'Very rare',
    category: 'total',
  },
];

// ─── Color Math ─────────────────────────────────────────────────
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function hexToRgb(hex: string): RGB | null {
  const h = hex.replace('#', '');
  const m6 = h.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m6) return { r: parseInt(m6[1], 16), g: parseInt(m6[2], 16), b: parseInt(m6[3], 16) };
  const m3 = h.match(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m3) return { r: parseInt(m3[1] + m3[1], 16), g: parseInt(m3[2] + m3[2], 16), b: parseInt(m3[3] + m3[3], 16) };
  return null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

// sRGB <-> linear conversions
function srgbToLinear(v: number): number {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  v = Math.max(0, v);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// ─── Simulation Matrices ────────────────────────────────────────
// Based on Brettel et al. (1997), Viénot et al. (1999), and Machado et al. (2009)
// Each matrix transforms linear RGB to simulated linear RGB

// Full dichromacy matrices (complete cone loss)
const PROTANOPIA_MATRIX = [
  0.152286, 1.052583, -0.204868,
  0.114503, 0.786281, 0.099216,
  -0.003882, -0.048116, 1.051998,
];

const DEUTERANOPIA_MATRIX = [
  0.367322, 0.860646, -0.227968,
  0.280085, 0.672501, 0.047413,
  -0.011820, 0.042940, 0.968881,
];

const TRITANOPIA_MATRIX = [
  1.255528, -0.076749, -0.178779,
  -0.078411, 0.930809, 0.147602,
  0.004733, 0.691367, 0.303900,
];

// Anomalous trichromacy (partial cone weakness) - Machado et al. severity ~0.6
const PROTANOMALY_MATRIX = [
  0.458064, 0.679578, -0.137642,
  0.092785, 0.846313, 0.060902,
  -0.007494, -0.016807, 1.024301,
];

const DEUTERANOMALY_MATRIX = [
  0.547494, 0.607765, -0.155259,
  0.181692, 0.781742, 0.036566,
  -0.010410, 0.027275, 0.983136,
];

const TRITANOMALY_MATRIX = [
  0.967992, 0.011340, 0.020668,
  -0.003210, 0.733398, 0.269812,
  0.003178, 0.271327, 0.725495,
];

type Matrix3x3 = number[];

function applyMatrix(lr: number, lg: number, lb: number, m: Matrix3x3): [number, number, number] {
  return [
    m[0] * lr + m[1] * lg + m[2] * lb,
    m[3] * lr + m[4] * lg + m[5] * lb,
    m[6] * lr + m[7] * lg + m[8] * lb,
  ];
}

// ─── Core Simulation ────────────────────────────────────────────
export function simulateColorBlindness(rgb: RGB, type: CVDType): RGB {
  const lr = srgbToLinear(rgb.r);
  const lg = srgbToLinear(rgb.g);
  const lb = srgbToLinear(rgb.b);

  let sr: number, sg: number, sb: number;

  switch (type) {
    case 'protanopia':
      [sr, sg, sb] = applyMatrix(lr, lg, lb, PROTANOPIA_MATRIX);
      break;
    case 'deuteranopia':
      [sr, sg, sb] = applyMatrix(lr, lg, lb, DEUTERANOPIA_MATRIX);
      break;
    case 'tritanopia':
      [sr, sg, sb] = applyMatrix(lr, lg, lb, TRITANOPIA_MATRIX);
      break;
    case 'protanomaly':
      [sr, sg, sb] = applyMatrix(lr, lg, lb, PROTANOMALY_MATRIX);
      break;
    case 'deuteranomaly':
      [sr, sg, sb] = applyMatrix(lr, lg, lb, DEUTERANOMALY_MATRIX);
      break;
    case 'tritanomaly':
      [sr, sg, sb] = applyMatrix(lr, lg, lb, TRITANOMALY_MATRIX);
      break;
    case 'achromatopsia': {
      // Luminance-only (rec. 709 coefficients)
      const gray = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      sr = gray;
      sg = gray;
      sb = gray;
      break;
    }
    case 'achromatomaly': {
      // Partial desaturation toward luminance (severity ~0.6)
      const gray = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      const s = 0.6;
      sr = lr * (1 - s) + gray * s;
      sg = lg * (1 - s) + gray * s;
      sb = lb * (1 - s) + gray * s;
      break;
    }
  }

  return {
    r: clamp(Math.round(linearToSrgb(sr) * 255), 0, 255),
    g: clamp(Math.round(linearToSrgb(sg) * 255), 0, 255),
    b: clamp(Math.round(linearToSrgb(sb) * 255), 0, 255),
  };
}

// ─── Image Processing ───────────────────────────────────────────
// Process an entire image through a CVD simulation using Canvas API
export function simulateImage(
  sourceCanvas: HTMLCanvasElement,
  type: CVDType,
  targetCanvas: HTMLCanvasElement
): void {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  targetCanvas.width = w;
  targetCanvas.height = h;

  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const dstCtx = targetCanvas.getContext('2d');
  if (!srcCtx || !dstCtx) return;

  const srcData = srcCtx.getImageData(0, 0, w, h);
  const dstData = dstCtx.createImageData(w, h);
  const src = srcData.data;
  const dst = dstData.data;

  for (let i = 0; i < src.length; i += 4) {
    const sim = simulateColorBlindness(
      { r: src[i], g: src[i + 1], b: src[i + 2] },
      type
    );
    dst[i] = sim.r;
    dst[i + 1] = sim.g;
    dst[i + 2] = sim.b;
    dst[i + 3] = src[i + 3]; // preserve alpha
  }

  dstCtx.putImageData(dstData, 0, 0);
}

// ─── Contrast Ratio (WCAG) ─────────────────────────────────────
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(c1: RGB, c2: RGB): number {
  const l1 = getLuminance(c1.r, c1.g, c1.b);
  const l2 = getLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Sample Gradient Colors ─────────────────────────────────────
// A diverse set of colors for the type selector gradient preview
export const SAMPLE_GRADIENT: RGB[] = [
  { r: 255, g: 0, b: 0 },
  { r: 255, g: 127, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 127, b: 255 },
  { r: 75, g: 0, b: 130 },
  { r: 148, g: 0, b: 211 },
  { r: 255, g: 0, b: 0 },
];

// ─── Storage ────────────────────────────────────────────────────
const STORAGE_KEY = 'color-blind-sim-state';
const MAX_IMAGE_SIZE = 500_000; // ~500KB for localStorage

export interface SavedState {
  imageDataUrl?: string;
  selectedType: CVDType;
  pickerColor: string;
  paletteColors: string[];
}

export function loadState(): SavedState | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full — try without image
    const { imageDataUrl: _, ...rest } = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    } catch {
      // give up
    }
  }
}
