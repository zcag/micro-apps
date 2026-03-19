const HABITS_KEY = 'habit-tracker-habits';
const COMPLETIONS_KEY = 'habit-tracker-completions';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
}

// completions: Record<habitId, string[]> where strings are date keys "YYYY-MM-DD"
export type Completions = Record<string, string[]>;

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function loadHabits(): Habit[] {
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHabits(habits: Habit[]) {
  localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
}

export function loadCompletions(): Completions {
  try {
    const raw = localStorage.getItem(COMPLETIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCompletions(completions: Completions) {
  localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
}

export function toggleCompletion(completions: Completions, habitId: string, date: string): Completions {
  const dates = completions[habitId] || [];
  const idx = dates.indexOf(date);
  if (idx >= 0) {
    return { ...completions, [habitId]: dates.filter((d) => d !== date) };
  }
  return { ...completions, [habitId]: [...dates, date] };
}

export function isCompletedOn(completions: Completions, habitId: string, date: string): boolean {
  return (completions[habitId] || []).includes(date);
}

export function getCurrentStreak(completions: Completions, habitId: string): number {
  const dates = completions[habitId] || [];
  if (dates.length === 0) return 0;

  let streak = 0;
  // Start from today; if not done today, start from yesterday
  const today = todayKey();
  let startOffset = dates.includes(today) ? 0 : 1;

  for (let i = startOffset; ; i++) {
    const key = dateKey(i);
    if (dates.includes(key)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function getBestStreak(completions: Completions, habitId: string): number {
  const dates = (completions[habitId] || []).slice().sort();
  if (dates.length === 0) return 0;

  let best = 1;
  let current = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (Math.round(diff) === 1) {
      current++;
      if (current > best) best = current;
    } else if (Math.round(diff) > 1) {
      current = 1;
    }
    // skip duplicates (diff === 0)
  }
  return best;
}

export function getCompletionRate(completions: Completions, habitId: string, habit: Habit): number {
  const dates = completions[habitId] || [];
  if (dates.length === 0) return 0;

  const created = new Date(habit.createdAt);
  const today = new Date(todayKey());
  const totalDays = Math.max(1, Math.round((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  return Math.round((dates.length / totalDays) * 100);
}

export function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => dateKey(6 - i));
}
