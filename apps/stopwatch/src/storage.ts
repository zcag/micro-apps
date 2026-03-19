const SESSIONS_KEY = 'stopwatch-sessions';

export interface Lap {
  number: number;
  lapTime: number; // ms
  totalTime: number; // ms
}

export interface Session {
  id: string;
  date: string;
  totalTime: number;
  laps: Lap[];
}

export function formatTime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export function formatTimeShort(ms: number): string {
  if (ms >= 60000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  const secs = Math.floor(ms / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${secs}.${centis.toString().padStart(2, '0')}`;
}

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function lapsToCSV(laps: Lap[]): string {
  const header = 'Lap,Lap Time,Total Time';
  const rows = laps.map(
    (l) => `${l.number},${formatTime(l.lapTime)},${formatTime(l.totalTime)}`
  );
  return [header, ...rows].join('\n');
}
