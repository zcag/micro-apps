export interface ShadowLayer {
  id: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
  inset: boolean;
}

export interface ShadowConfig {
  layers: ShadowLayer[];
  previewSize: number;
  previewBg: string;
  previewRadius: number;
  boxColor: string;
}

export interface Preset {
  name: string;
  layers: ShadowLayer[];
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function layerToCss(layer: ShadowLayer): string {
  const color = hexToRgba(layer.color, layer.opacity);
  const inset = layer.inset ? 'inset ' : '';
  return `${inset}${layer.offsetX}px ${layer.offsetY}px ${layer.blur}px ${layer.spread}px ${color}`;
}

export function generateCssString(layers: ShadowLayer[]): string {
  if (layers.length === 0) return 'none';
  return layers.map(layerToCss).join(',\n    ');
}

export function generateCssCode(layers: ShadowLayer[]): string {
  if (layers.length === 0) return 'box-shadow: none;';
  if (layers.length === 1) return `box-shadow: ${layerToCss(layers[0])};`;
  return `box-shadow:\n    ${generateCssString(layers)};`;
}

export function createDefaultLayer(overrides?: Partial<ShadowLayer>): ShadowLayer {
  return {
    id: generateId(),
    offsetX: 0,
    offsetY: 4,
    blur: 12,
    spread: 0,
    color: '#000000',
    opacity: 0.15,
    inset: false,
    ...overrides,
  };
}

export function parseCss(css: string): ShadowLayer[] | null {
  const cleaned = css
    .replace(/box-shadow\s*:\s*/i, '')
    .replace(/;/g, '')
    .trim();
  if (!cleaned || cleaned === 'none') return null;

  const layers: ShadowLayer[] = [];
  // Split by comma but not inside rgba/hsla parentheses
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of cleaned) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    const layer = parseSingleShadow(part);
    if (layer) layers.push(layer);
  }

  return layers.length > 0 ? layers : null;
}

function parseSingleShadow(str: string): ShadowLayer | null {
  const s = str.trim();
  const inset = /\binset\b/i.test(s);
  const withoutInset = s.replace(/\binset\b/gi, '').trim();

  // Extract color (rgba, hsla, hex, or named)
  let color = '#000000';
  let opacity = 1;
  let withoutColor = withoutInset;

  const rgbaMatch = withoutInset.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
    color = `#${r}${g}${b}`;
    opacity = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
    withoutColor = withoutInset.replace(rgbaMatch[0], '').trim();
  } else {
    const hexMatch = withoutInset.match(/#[0-9a-fA-F]{3,8}/);
    if (hexMatch) {
      let hex = hexMatch[0];
      if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      }
      color = hex.slice(0, 7);
      if (hex.length === 9) {
        opacity = parseInt(hex.slice(7, 9), 16) / 255;
      }
      withoutColor = withoutInset.replace(hexMatch[0], '').trim();
    }
  }

  const nums = withoutColor.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 2) return null;

  return {
    id: generateId(),
    offsetX: parseFloat(nums[0]),
    offsetY: parseFloat(nums[1]),
    blur: nums[2] ? parseFloat(nums[2]) : 0,
    spread: nums[3] ? parseFloat(nums[3]) : 0,
    color,
    opacity: Math.round(opacity * 100) / 100,
    inset,
  };
}

export const DEFAULT_CONFIG: ShadowConfig = {
  layers: [
    createDefaultLayer({
      id: 'init1',
      offsetX: 0,
      offsetY: 4,
      blur: 6,
      spread: -1,
      color: '#000000',
      opacity: 0.1,
    }),
    createDefaultLayer({
      id: 'init2',
      offsetX: 0,
      offsetY: 10,
      blur: 15,
      spread: -3,
      color: '#000000',
      opacity: 0.1,
    }),
  ],
  previewSize: 200,
  previewBg: '#f0f0f0',
  previewRadius: 16,
  boxColor: '#ffffff',
};

export const PRESETS: Preset[] = [
  {
    name: 'Subtle',
    layers: [
      { id: 'ps1', offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: '#000000', opacity: 0.08, inset: false },
      { id: 'ps2', offsetX: 0, offsetY: 1, blur: 2, spread: -1, color: '#000000', opacity: 0.06, inset: false },
    ],
  },
  {
    name: 'Medium',
    layers: [
      { id: 'pm1', offsetX: 0, offsetY: 4, blur: 6, spread: -1, color: '#000000', opacity: 0.1, inset: false },
      { id: 'pm2', offsetX: 0, offsetY: 10, blur: 15, spread: -3, color: '#000000', opacity: 0.1, inset: false },
    ],
  },
  {
    name: 'Heavy',
    layers: [
      { id: 'ph1', offsetX: 0, offsetY: 10, blur: 15, spread: -3, color: '#000000', opacity: 0.15, inset: false },
      { id: 'ph2', offsetX: 0, offsetY: 20, blur: 40, spread: -4, color: '#000000', opacity: 0.2, inset: false },
    ],
  },
  {
    name: 'Floating',
    layers: [
      { id: 'pf1', offsetX: 0, offsetY: 20, blur: 25, spread: -5, color: '#000000', opacity: 0.1, inset: false },
      { id: 'pf2', offsetX: 0, offsetY: 40, blur: 60, spread: -12, color: '#000000', opacity: 0.15, inset: false },
      { id: 'pf3', offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: '#000000', opacity: 0.05, inset: false },
    ],
  },
  {
    name: 'Pressed',
    layers: [
      { id: 'pp1', offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.1, inset: true },
      { id: 'pp2', offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: '#000000', opacity: 0.06, inset: true },
    ],
  },
  {
    name: 'Layered',
    layers: [
      { id: 'pl1', offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: '#000000', opacity: 0.05, inset: false },
      { id: 'pl2', offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.05, inset: false },
      { id: 'pl3', offsetX: 0, offsetY: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.05, inset: false },
      { id: 'pl4', offsetX: 0, offsetY: 8, blur: 16, spread: 0, color: '#000000', opacity: 0.05, inset: false },
      { id: 'pl5', offsetX: 0, offsetY: 16, blur: 32, spread: 0, color: '#000000', opacity: 0.05, inset: false },
    ],
  },
  {
    name: 'Neumorphism',
    layers: [
      { id: 'pn1', offsetX: 6, offsetY: 6, blur: 12, spread: 0, color: '#000000', opacity: 0.15, inset: false },
      { id: 'pn2', offsetX: -6, offsetY: -6, blur: 12, spread: 0, color: '#ffffff', opacity: 0.8, inset: false },
    ],
  },
];

const STORAGE_KEY = 'box-shadow-config';

export function loadConfig(): ShadowConfig | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

export function saveConfig(config: ShadowConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}
