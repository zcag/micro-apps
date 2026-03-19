const HISTORY_KEY = 'percentage-calc-history';

export type CalcMode = 'whatIs' | 'whatPercent' | 'change';

export interface HistoryEntry {
  id: string;
  mode: CalcMode;
  expression: string;
  result: string;
  timestamp: number;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
