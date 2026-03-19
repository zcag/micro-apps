const BEST_KEY = 'typing-test-best';
const HISTORY_KEY = 'typing-test-history';

export interface TestResult {
  id: string;
  date: string;
  wpm: number;
  accuracy: number;
  timeMode: number; // seconds
  charsTyped: number;
  errors: number;
}

export type BestScores = Record<number, number>; // timeMode -> best WPM

export function loadBestScores(): BestScores {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveBestScores(scores: BestScores) {
  localStorage.setItem(BEST_KEY, JSON.stringify(scores));
}

export function loadHistory(): TestResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: TestResult[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
