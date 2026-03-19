const EVENTS_KEY = 'countdown-timer-events';

export type EventCategory = 'birthday' | 'holiday' | 'deadline' | 'travel' | 'custom';

export interface CountdownEvent {
  id: string;
  name: string;
  targetDate: string; // ISO date string YYYY-MM-DD
  targetTime: string; // HH:MM (24h)
  category: EventCategory;
  createdAt: string;
}

export const CATEGORY_ICONS: Record<EventCategory, string> = {
  birthday: '\u{1F382}',
  holiday: '\u{1F389}',
  deadline: '\u{23F0}',
  travel: '\u{2708}\uFE0F',
  custom: '\u{2B50}',
};

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  birthday: 'Birthday',
  holiday: 'Holiday',
  deadline: 'Deadline',
  travel: 'Travel',
  custom: 'Custom',
};

export const CATEGORY_GRADIENTS: Record<EventCategory, string> = {
  birthday: 'linear-gradient(135deg, #f97316, #ec4899)',
  holiday: 'linear-gradient(135deg, #ef4444, #f97316)',
  deadline: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  travel: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
  custom: 'linear-gradient(135deg, #f97316, #fb923c)',
};

export function loadEvents(): CountdownEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveEvents(events: CountdownEvent[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export interface TimeRemaining {
  total: number; // total milliseconds
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

export function getTimeRemaining(targetDate: string, targetTime: string): TimeRemaining {
  const target = new Date(`${targetDate}T${targetTime || '00:00'}:00`).getTime();
  const now = Date.now();
  const total = target - now;
  const isPast = total <= 0;
  const abs = Math.abs(total);

  return {
    total,
    days: Math.floor(abs / (1000 * 60 * 60 * 24)),
    hours: Math.floor((abs / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((abs / (1000 * 60)) % 60),
    seconds: Math.floor((abs / 1000) % 60),
    isPast,
  };
}

export function encodeEventToParams(event: CountdownEvent): string {
  const params = new URLSearchParams({
    name: event.name,
    date: event.targetDate,
    time: event.targetTime,
    cat: event.category,
  });
  return params.toString();
}

export function decodeEventFromParams(search: string): Partial<CountdownEvent> | null {
  const params = new URLSearchParams(search);
  const name = params.get('name');
  const date = params.get('date');
  if (!name || !date) return null;
  return {
    name,
    targetDate: date,
    targetTime: params.get('time') || '00:00',
    category: (params.get('cat') as EventCategory) || 'custom',
  };
}
