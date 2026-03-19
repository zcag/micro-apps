const HISTORY_KEY = 'bmi-calc-history';

export type UnitSystem = 'imperial' | 'metric';

export interface BmiEntry {
  id: string;
  bmi: number;
  category: string;
  heightCm: number;
  weightKg: number;
  date: string;
}

export interface BmiCategory {
  label: string;
  range: string;
  color: string;
  min: number;
  max: number;
}

export const BMI_CATEGORIES: BmiCategory[] = [
  { label: 'Underweight', range: '< 18.5', color: '#06b6d4', min: 0, max: 18.5 },
  { label: 'Normal', range: '18.5 – 24.9', color: '#22c55e', min: 18.5, max: 25 },
  { label: 'Overweight', range: '25 – 29.9', color: '#f59e0b', min: 25, max: 30 },
  { label: 'Obese', range: '30+', color: '#ef4444', min: 30, max: 50 },
];

export function getBmiCategory(bmi: number): BmiCategory {
  for (const cat of BMI_CATEGORIES) {
    if (bmi < cat.max) return cat;
  }
  return BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
}

export function calculateBmi(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function getHealthyWeightRange(heightCm: number): { min: number; max: number } {
  const heightM = heightCm / 100;
  return {
    min: Math.round(18.5 * heightM * heightM * 10) / 10,
    max: Math.round(24.9 * heightM * heightM * 10) / 10,
  };
}

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * 2.54;
}

export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

export function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}

export function loadHistory(): BmiEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: BmiEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
