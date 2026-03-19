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
} as const;

export type ThemeTokens = typeof lightTheme;
export type ThemeMode = 'light' | 'dark';
