export interface Flashcard {
  id: string;
  front: string;
  back: string;
  nextReview: number;
  interval: number;
  easeFactor: number;
  repetitions: number;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  cards: Flashcard[];
  createdAt: number;
}

export type Difficulty = 'hard' | 'medium' | 'easy';

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createCard(front: string, back: string): Flashcard {
  return {
    id: generateId(),
    front,
    back,
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
  };
}

export function createDeck(name: string, description: string = ''): Deck {
  return {
    id: generateId(),
    name,
    description,
    cards: [],
    createdAt: Date.now(),
  };
}

export function rateCard(card: Flashcard, difficulty: Difficulty): Flashcard {
  const now = Date.now();
  const dayMs = 86400000;

  let { interval, easeFactor, repetitions } = card;

  switch (difficulty) {
    case 'hard':
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.3);
      repetitions = 0;
      break;
    case 'medium':
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 3;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions += 1;
      break;
    case 'easy':
      if (repetitions === 0) {
        interval = 3;
      } else if (repetitions === 1) {
        interval = 7;
      } else {
        interval = Math.round(interval * easeFactor * 1.3);
      }
      easeFactor = Math.min(3.0, easeFactor + 0.15);
      repetitions += 1;
      break;
  }

  return {
    ...card,
    interval,
    easeFactor,
    repetitions,
    nextReview: now + interval * dayMs,
  };
}

export function getDueCards(cards: Flashcard[]): Flashcard[] {
  const now = Date.now();
  return cards
    .filter((c) => c.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview);
}

export function getDeckStats(cards: Flashcard[]) {
  const now = Date.now();
  const due = cards.filter((c) => c.nextReview <= now).length;
  const mastered = cards.filter((c) => c.repetitions >= 3 && c.nextReview > now).length;
  const learning = cards.length - mastered;
  return { total: cards.length, due, mastered, learning };
}

export function parseImport(text: string): { front: string; back: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes('|'))
    .map((line) => {
      const idx = line.indexOf('|');
      return {
        front: line.slice(0, idx).trim(),
        back: line.slice(idx + 1).trim(),
      };
    })
    .filter((c) => c.front.length > 0 && c.back.length > 0);
}

const STORAGE_KEY = 'flashcards-decks';

export function saveDecks(decks: Deck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

export function loadDecks(): Deck[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Deck[];
  } catch {
    return [];
  }
}
