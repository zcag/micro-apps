const STORAGE_KEY = 'border-radius-config';

export type Unit = 'px' | '%' | 'em';

export interface CornerRadius {
  horizontal: number;
  vertical: number;
  unit: Unit;
}

export interface PreviewOptions {
  size: number;
  bgColor: string;
  borderWidth: number;
  borderColor: string;
}

export interface BorderRadiusConfig {
  corners: {
    topLeft: CornerRadius;
    topRight: CornerRadius;
    bottomRight: CornerRadius;
    bottomLeft: CornerRadius;
  };
  linked: boolean;
  elliptical: boolean;
  preview: PreviewOptions;
  vendorPrefixes: boolean;
}

export const DEFAULT_CORNER: CornerRadius = {
  horizontal: 20,
  vertical: 20,
  unit: 'px',
};

export const DEFAULT_CONFIG: BorderRadiusConfig = {
  corners: {
    topLeft: { ...DEFAULT_CORNER },
    topRight: { ...DEFAULT_CORNER },
    bottomRight: { ...DEFAULT_CORNER },
    bottomLeft: { ...DEFAULT_CORNER },
  },
  linked: true,
  elliptical: false,
  preview: {
    size: 240,
    bgColor: '#8b5cf6',
    borderWidth: 0,
    borderColor: '#6d28d9',
  },
  vendorPrefixes: false,
};

export type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

export const CORNER_KEYS: CornerKey[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

export const CORNER_LABELS: Record<CornerKey, string> = {
  topLeft: 'Top Left',
  topRight: 'Top Right',
  bottomRight: 'Bottom Right',
  bottomLeft: 'Bottom Left',
};

function formatValue(v: number, unit: Unit): string {
  return `${v}${unit}`;
}

export function generateBorderRadiusValue(config: BorderRadiusConfig): string {
  const { corners, elliptical } = config;
  const c = corners;

  if (elliptical) {
    const h = CORNER_KEYS.map((k) => formatValue(c[k].horizontal, c[k].unit));
    const v = CORNER_KEYS.map((k) => formatValue(c[k].vertical, c[k].unit));
    const hStr = h.join(' ');
    const vStr = v.join(' ');
    if (hStr === vStr) return hStr;
    return `${hStr} / ${vStr}`;
  }

  const values = CORNER_KEYS.map((k) => formatValue(c[k].horizontal, c[k].unit));
  // Shorthand optimization
  if (values[0] === values[1] && values[1] === values[2] && values[2] === values[3]) {
    return values[0];
  }
  if (values[0] === values[2] && values[1] === values[3]) {
    return `${values[0]} ${values[1]}`;
  }
  if (values[1] === values[3]) {
    return `${values[0]} ${values[1]} ${values[2]}`;
  }
  return values.join(' ');
}

export function generateCssCode(config: BorderRadiusConfig): string {
  const value = generateBorderRadiusValue(config);
  const lines: string[] = [];
  if (config.vendorPrefixes) {
    lines.push(`-webkit-border-radius: ${value};`);
    lines.push(`-moz-border-radius: ${value};`);
  }
  lines.push(`border-radius: ${value};`);
  return lines.join('\n');
}

export function generateInlineStyle(config: BorderRadiusConfig): string {
  const { corners, elliptical } = config;
  const c = corners;

  if (elliptical) {
    const tl = `${c.topLeft.horizontal}${c.topLeft.unit} ${c.topLeft.vertical}${c.topLeft.unit}`;
    const tr = `${c.topRight.horizontal}${c.topRight.unit} ${c.topRight.vertical}${c.topRight.unit}`;
    const br = `${c.bottomRight.horizontal}${c.bottomRight.unit} ${c.bottomRight.vertical}${c.bottomRight.unit}`;
    const bl = `${c.bottomLeft.horizontal}${c.bottomLeft.unit} ${c.bottomLeft.vertical}${c.bottomLeft.unit}`;
    // CSS individual corner properties support elliptical
    return [tl, tr, br, bl].join(' / ') ;
  }

  return generateBorderRadiusValue(config);
}

export function parseBorderRadiusCss(input: string): BorderRadiusConfig | null {
  try {
    let value = input.trim();
    // Strip property name and semicolons
    value = value.replace(/^border-radius\s*:\s*/i, '').replace(/;?\s*$/, '');
    // Remove vendor prefixed lines
    value = value.replace(/^-(?:webkit|moz)-border-radius\s*:\s*[^;]+;\s*/gm, '').trim();
    if (!value) return null;

    const config: BorderRadiusConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    const parts = value.split('/').map((s) => s.trim());
    const hValues = parseValues(parts[0]);
    const vValues = parts[1] ? parseValues(parts[1]) : null;

    if (!hValues || hValues.length === 0) return null;

    const hExpanded = expandShorthand(hValues);
    const vExpanded = vValues ? expandShorthand(vValues) : hExpanded;

    CORNER_KEYS.forEach((key, i) => {
      config.corners[key].horizontal = hExpanded[i].value;
      config.corners[key].unit = hExpanded[i].unit;
      config.corners[key].vertical = vExpanded[i].value;
      if (vValues) {
        config.corners[key].unit = hExpanded[i].unit;
      }
    });

    config.elliptical = vValues !== null;
    config.linked = CORNER_KEYS.every(
      (k) =>
        config.corners[k].horizontal === config.corners.topLeft.horizontal &&
        config.corners[k].vertical === config.corners.topLeft.vertical
    );

    return config;
  } catch {
    return null;
  }
}

interface ParsedValue {
  value: number;
  unit: Unit;
}

function parseValues(str: string): ParsedValue[] | null {
  const parts = str.trim().split(/\s+/);
  const results: ParsedValue[] = [];
  for (const p of parts) {
    const match = p.match(/^(\d+(?:\.\d+)?)(px|%|em)?$/);
    if (!match) return null;
    results.push({ value: parseFloat(match[1]), unit: (match[2] as Unit) || 'px' });
  }
  return results;
}

function expandShorthand(values: ParsedValue[]): [ParsedValue, ParsedValue, ParsedValue, ParsedValue] {
  switch (values.length) {
    case 1:
      return [values[0], values[0], values[0], values[0]];
    case 2:
      return [values[0], values[1], values[0], values[1]];
    case 3:
      return [values[0], values[1], values[2], values[1]];
    case 4:
      return [values[0], values[1], values[2], values[3]];
    default:
      return [values[0], values[0], values[0], values[0]];
  }
}

export interface Preset {
  name: string;
  config: Partial<BorderRadiusConfig>;
}

export const PRESETS: Preset[] = [
  {
    name: 'Circle',
    config: {
      corners: {
        topLeft: { horizontal: 50, vertical: 50, unit: '%' },
        topRight: { horizontal: 50, vertical: 50, unit: '%' },
        bottomRight: { horizontal: 50, vertical: 50, unit: '%' },
        bottomLeft: { horizontal: 50, vertical: 50, unit: '%' },
      },
      linked: true,
      elliptical: false,
    },
  },
  {
    name: 'Pill',
    config: {
      corners: {
        topLeft: { horizontal: 999, vertical: 999, unit: 'px' },
        topRight: { horizontal: 999, vertical: 999, unit: 'px' },
        bottomRight: { horizontal: 999, vertical: 999, unit: 'px' },
        bottomLeft: { horizontal: 999, vertical: 999, unit: 'px' },
      },
      linked: true,
      elliptical: false,
    },
  },
  {
    name: 'Squircle',
    config: {
      corners: {
        topLeft: { horizontal: 30, vertical: 30, unit: '%' },
        topRight: { horizontal: 30, vertical: 30, unit: '%' },
        bottomRight: { horizontal: 30, vertical: 30, unit: '%' },
        bottomLeft: { horizontal: 30, vertical: 30, unit: '%' },
      },
      linked: true,
      elliptical: false,
    },
  },
  {
    name: 'Leaf',
    config: {
      corners: {
        topLeft: { horizontal: 0, vertical: 0, unit: 'px' },
        topRight: { horizontal: 50, vertical: 50, unit: '%' },
        bottomRight: { horizontal: 0, vertical: 0, unit: 'px' },
        bottomLeft: { horizontal: 50, vertical: 50, unit: '%' },
      },
      linked: false,
      elliptical: false,
    },
  },
  {
    name: 'Blob',
    config: {
      corners: {
        topLeft: { horizontal: 60, vertical: 40, unit: '%' },
        topRight: { horizontal: 30, vertical: 70, unit: '%' },
        bottomRight: { horizontal: 70, vertical: 30, unit: '%' },
        bottomLeft: { horizontal: 40, vertical: 60, unit: '%' },
      },
      linked: false,
      elliptical: true,
    },
  },
  {
    name: 'Ticket',
    config: {
      corners: {
        topLeft: { horizontal: 12, vertical: 12, unit: 'px' },
        topRight: { horizontal: 12, vertical: 12, unit: 'px' },
        bottomRight: { horizontal: 50, vertical: 50, unit: '%' },
        bottomLeft: { horizontal: 50, vertical: 50, unit: '%' },
      },
      linked: false,
      elliptical: false,
    },
  },
  {
    name: 'Chat Bubble',
    config: {
      corners: {
        topLeft: { horizontal: 20, vertical: 20, unit: 'px' },
        topRight: { horizontal: 20, vertical: 20, unit: 'px' },
        bottomRight: { horizontal: 20, vertical: 20, unit: 'px' },
        bottomLeft: { horizontal: 4, vertical: 4, unit: 'px' },
      },
      linked: false,
      elliptical: false,
    },
  },
  {
    name: 'Organic',
    config: {
      corners: {
        topLeft: { horizontal: 40, vertical: 70, unit: '%' },
        topRight: { horizontal: 70, vertical: 40, unit: '%' },
        bottomRight: { horizontal: 50, vertical: 60, unit: '%' },
        bottomLeft: { horizontal: 60, vertical: 50, unit: '%' },
      },
      linked: false,
      elliptical: true,
    },
  },
  {
    name: 'Drop',
    config: {
      corners: {
        topLeft: { horizontal: 50, vertical: 50, unit: '%' },
        topRight: { horizontal: 50, vertical: 50, unit: '%' },
        bottomRight: { horizontal: 50, vertical: 50, unit: '%' },
        bottomLeft: { horizontal: 0, vertical: 0, unit: 'px' },
      },
      linked: false,
      elliptical: false,
    },
  },
  {
    name: 'Shield',
    config: {
      corners: {
        topLeft: { horizontal: 50, vertical: 50, unit: '%' },
        topRight: { horizontal: 50, vertical: 50, unit: '%' },
        bottomRight: { horizontal: 10, vertical: 50, unit: '%' },
        bottomLeft: { horizontal: 10, vertical: 50, unit: '%' },
      },
      linked: false,
      elliptical: true,
    },
  },
];

export function loadConfig(): BorderRadiusConfig | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

export function saveConfig(config: BorderRadiusConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}
