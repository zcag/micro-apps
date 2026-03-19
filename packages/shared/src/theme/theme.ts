export const lightTheme = {
  '--bg': '#ffffff',
  '--bg-secondary': '#f5f5f7',
  '--text': '#1d1d1f',
  '--text-secondary': '#86868b',
  '--accent': '#0071e3',
  '--accent-hover': '#0077ED',
  '--border': '#d2d2d7',
  '--shadow': 'rgba(0, 0, 0, 0.08)',
  '--card-bg': '#ffffff',
  '--success': '#34c759',
  '--warning': '#ff9500',
  '--error': '#ff3b30',
  // Gradients
  '--gradient-primary': 'linear-gradient(135deg, #0071e3, #7c3aed)',
  '--gradient-success': 'linear-gradient(135deg, #34c759, #14b8a6)',
  '--gradient-warm': 'linear-gradient(135deg, #ff9500, #ec4899)',
  // Elevated shadows (layered multi-stop)
  '--shadow-sm': '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
  '--shadow-md': '0 2px 4px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  '--shadow-lg': '0 4px 8px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.06), 0 12px 24px rgba(0,0,0,0.08)',
  '--shadow-xl': '0 8px 16px rgba(0,0,0,0.04), 0 16px 32px rgba(0,0,0,0.06), 0 24px 48px rgba(0,0,0,0.1)',
  // Radii
  '--radius-sm': '6px',
  '--radius-md': '12px',
  '--radius-lg': '20px',
  '--radius-xl': '28px',
  // Transitions
  '--transition-fast': '150ms',
  '--transition-normal': '250ms',
  '--transition-slow': '400ms',
  // Background texture (subtle noise overlay)
  '--bg-texture': 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
} as const;

export const darkTheme = {
  '--bg': '#000000',
  '--bg-secondary': '#1c1c1e',
  '--text': '#f5f5f7',
  '--text-secondary': '#98989d',
  '--accent': '#0a84ff',
  '--accent-hover': '#409CFF',
  '--border': '#38383a',
  '--shadow': 'rgba(0, 0, 0, 0.3)',
  '--card-bg': '#1c1c1e',
  '--success': '#30d158',
  '--warning': '#ff9f0a',
  '--error': '#ff453a',
  // Gradients
  '--gradient-primary': 'linear-gradient(135deg, #0a84ff, #a855f7)',
  '--gradient-success': 'linear-gradient(135deg, #30d158, #2dd4bf)',
  '--gradient-warm': 'linear-gradient(135deg, #ff9f0a, #f472b6)',
  // Elevated shadows (layered multi-stop)
  '--shadow-sm': '0 1px 2px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.3)',
  '--shadow-md': '0 2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
  '--shadow-lg': '0 4px 8px rgba(0,0,0,0.2), 0 8px 16px rgba(0,0,0,0.3), 0 12px 24px rgba(0,0,0,0.35)',
  '--shadow-xl': '0 8px 16px rgba(0,0,0,0.2), 0 16px 32px rgba(0,0,0,0.3), 0 24px 48px rgba(0,0,0,0.4)',
  // Radii
  '--radius-sm': '6px',
  '--radius-md': '12px',
  '--radius-lg': '20px',
  '--radius-xl': '28px',
  // Transitions
  '--transition-fast': '150ms',
  '--transition-normal': '250ms',
  '--transition-slow': '400ms',
  // Background texture
  '--bg-texture': 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.02\'/%3E%3C/svg%3E")',
} as const;

export type ThemeTokens = typeof lightTheme;
export type ThemeMode = 'light' | 'dark';
