const SETTINGS_KEY = 'pomodoro-settings';
const SESSIONS_KEY = 'pomodoro-sessions';
const STREAK_KEY = 'pomodoro-streak';

export interface Settings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  autoStart: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTodaySessions(): number {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return data.date === todayKey() ? data.count : 0;
  } catch {
    return 0;
  }
}

export function incrementSessions(): number {
  const today = todayKey();
  const current = getTodaySessions();
  const next = current + 1;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify({ date: today, count: next }));
  updateStreak(today);
  return next;
}

interface StreakData {
  lastDate: string;
  count: number;
}

function updateStreak(today: string) {
  const streak = loadStreak();
  if (streak.lastDate === today) return; // Already counted today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (streak.lastDate === yesterdayKey) {
    saveStreak({ lastDate: today, count: streak.count + 1 });
  } else {
    saveStreak({ lastDate: today, count: 1 });
  }
}

function loadStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : { lastDate: '', count: 0 };
  } catch {
    return { lastDate: '', count: 0 };
  }
}

function saveStreak(data: StreakData) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

export function getStreak(): number {
  const streak = loadStreak();
  const today = todayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  // Streak is valid if last session was today or yesterday
  if (streak.lastDate === today || streak.lastDate === yesterdayKey) {
    return streak.count;
  }
  return 0;
}
