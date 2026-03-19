export type GradientType = 'linear' | 'radial' | 'conic';

export interface ColorStop {
  id: string;
  color: string;
  position: number; // 0-100
}

export interface GradientState {
  type: GradientType;
  angle: number; // degrees for linear
  stops: ColorStop[];
}

export interface Preset {
  name: string;
  gradient: GradientState;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function randomColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 30);
  const l = 45 + Math.floor(Math.random() * 25);
  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateCssString(state: GradientState): string {
  const stops = state.stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');

  switch (state.type) {
    case 'linear':
      return `linear-gradient(${state.angle}deg, ${stops})`;
    case 'radial':
      return `radial-gradient(circle, ${stops})`;
    case 'conic':
      return `conic-gradient(from ${state.angle}deg, ${stops})`;
  }
}

export function createRandomGradient(): GradientState {
  const types: GradientType[] = ['linear', 'radial', 'conic'];
  const type = types[Math.floor(Math.random() * types.length)];
  const angle = Math.floor(Math.random() * 360);
  const numStops = 2 + Math.floor(Math.random() * 3);
  const stops: ColorStop[] = [];
  for (let i = 0; i < numStops; i++) {
    stops.push({
      id: generateId(),
      color: randomColor(),
      position: Math.round((i / (numStops - 1)) * 100),
    });
  }
  return { type, angle, stops };
}

export const PRESETS: Preset[] = [
  {
    name: 'Sunset Blaze',
    gradient: {
      type: 'linear', angle: 135,
      stops: [
        { id: 'p1a', color: '#ff6b35', position: 0 },
        { id: 'p1b', color: '#f7c948', position: 50 },
        { id: 'p1c', color: '#ff3864', position: 100 },
      ],
    },
  },
  {
    name: 'Ocean Breeze',
    gradient: {
      type: 'linear', angle: 180,
      stops: [
        { id: 'p2a', color: '#0ea5e9', position: 0 },
        { id: 'p2b', color: '#06b6d4', position: 50 },
        { id: 'p2c', color: '#6366f1', position: 100 },
      ],
    },
  },
  {
    name: 'Aurora',
    gradient: {
      type: 'linear', angle: 45,
      stops: [
        { id: 'p3a', color: '#a855f7', position: 0 },
        { id: 'p3b', color: '#06b6d4', position: 50 },
        { id: 'p3c', color: '#10b981', position: 100 },
      ],
    },
  },
  {
    name: 'Candy Pop',
    gradient: {
      type: 'linear', angle: 90,
      stops: [
        { id: 'p4a', color: '#ec4899', position: 0 },
        { id: 'p4b', color: '#f472b6', position: 50 },
        { id: 'p4c', color: '#a78bfa', position: 100 },
      ],
    },
  },
  {
    name: 'Forest Mist',
    gradient: {
      type: 'linear', angle: 160,
      stops: [
        { id: 'p5a', color: '#059669', position: 0 },
        { id: 'p5b', color: '#34d399', position: 50 },
        { id: 'p5c', color: '#a7f3d0', position: 100 },
      ],
    },
  },
  {
    name: 'Midnight',
    gradient: {
      type: 'linear', angle: 135,
      stops: [
        { id: 'p6a', color: '#1e1b4b', position: 0 },
        { id: 'p6b', color: '#4338ca', position: 50 },
        { id: 'p6c', color: '#7c3aed', position: 100 },
      ],
    },
  },
  {
    name: 'Peach Glow',
    gradient: {
      type: 'radial', angle: 0,
      stops: [
        { id: 'p7a', color: '#fde68a', position: 0 },
        { id: 'p7b', color: '#fb923c', position: 50 },
        { id: 'p7c', color: '#e11d48', position: 100 },
      ],
    },
  },
  {
    name: 'Cool Steel',
    gradient: {
      type: 'linear', angle: 200,
      stops: [
        { id: 'p8a', color: '#cbd5e1', position: 0 },
        { id: 'p8b', color: '#64748b', position: 50 },
        { id: 'p8c', color: '#1e293b', position: 100 },
      ],
    },
  },
  {
    name: 'Neon Pulse',
    gradient: {
      type: 'linear', angle: 90,
      stops: [
        { id: 'p9a', color: '#00ff87', position: 0 },
        { id: 'p9b', color: '#60efff', position: 50 },
        { id: 'p9c', color: '#ff00e5', position: 100 },
      ],
    },
  },
  {
    name: 'Golden Hour',
    gradient: {
      type: 'linear', angle: 45,
      stops: [
        { id: 'p10a', color: '#f59e0b', position: 0 },
        { id: 'p10b', color: '#ef4444', position: 100 },
      ],
    },
  },
  {
    name: 'Cosmic Swirl',
    gradient: {
      type: 'conic', angle: 0,
      stops: [
        { id: 'p11a', color: '#8b5cf6', position: 0 },
        { id: 'p11b', color: '#ec4899', position: 33 },
        { id: 'p11c', color: '#f59e0b', position: 66 },
        { id: 'p11d', color: '#8b5cf6', position: 100 },
      ],
    },
  },
  {
    name: 'Arctic Frost',
    gradient: {
      type: 'radial', angle: 0,
      stops: [
        { id: 'p12a', color: '#ffffff', position: 0 },
        { id: 'p12b', color: '#bae6fd', position: 50 },
        { id: 'p12c', color: '#0284c7', position: 100 },
      ],
    },
  },
  {
    name: 'Lava Flow',
    gradient: {
      type: 'linear', angle: 0,
      stops: [
        { id: 'p13a', color: '#dc2626', position: 0 },
        { id: 'p13b', color: '#f97316', position: 40 },
        { id: 'p13c', color: '#fbbf24', position: 70 },
        { id: 'p13d', color: '#fef3c7', position: 100 },
      ],
    },
  },
  {
    name: 'Holographic',
    gradient: {
      type: 'conic', angle: 45,
      stops: [
        { id: 'p14a', color: '#06b6d4', position: 0 },
        { id: 'p14b', color: '#8b5cf6', position: 25 },
        { id: 'p14c', color: '#ec4899', position: 50 },
        { id: 'p14d', color: '#f59e0b', position: 75 },
        { id: 'p14e', color: '#06b6d4', position: 100 },
      ],
    },
  },
  {
    name: 'Deep Sea',
    gradient: {
      type: 'radial', angle: 0,
      stops: [
        { id: 'p15a', color: '#06b6d4', position: 0 },
        { id: 'p15b', color: '#1e3a5f', position: 60 },
        { id: 'p15c', color: '#0f172a', position: 100 },
      ],
    },
  },
];
