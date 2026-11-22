/**
 * Peso (RF-70, RF-57): media mobile a 7 giorni, variazione settimanale, tastierino con la
 * virgola e serie del grafico. Funzioni pure sulle pesate `{ date, kg }`.
 */

import { addDays } from './diary';
import { formatNumber } from './format';

export interface WeightPoint {
  date: string;
  kg: number;
}

export const MIN_KG = 20;
export const MAX_KG = 400;

/** Media delle pesate dei `days` giorni di calendario che finiscono a `date`; null se non ce ne sono. */
export function movingAverage(
  entries: readonly WeightPoint[],
  date: string,
  days = 7,
): number | null {
  const from = addDays(date, -(days - 1));
  const inside = entries.filter((entry) => entry.date >= from && entry.date <= date);
  if (inside.length === 0) return null;
  return inside.reduce((sum, entry) => sum + entry.kg, 0) / inside.length;
}

export interface WeeklyChange {
  kg: number;
  percent: number;
}

/** Media a `date` meno media a `date − 7`; null se manca una delle due. */
export function weeklyChange(entries: readonly WeightPoint[], date: string): WeeklyChange | null {
  const now = movingAverage(entries, date);
  const before = movingAverage(entries, addDays(date, -7));
  if (now === null || before === null) return null;
  return { kg: now - before, percent: ((now - before) / before) * 100 };
}

/** Grammi di proteine per chilo di peso; null senza una media valida. */
export function proteinPerKg(proteinG: number, averageKg: number | null): number | null {
  if (averageKg === null || averageKg <= 0) return null;
  return proteinG / averageKg;
}

/** "−0,4 kg (−0,5%) in una settimana", con il segno meno vero. */
export function formatChange(change: WeeklyChange): string {
  const kg = formatNumber(Math.abs(change.kg), 1);
  if (kg === '0,0') return 'Invariato in una settimana';
  const sign = change.kg < 0 ? '−' : '+';
  return `${sign}${kg} kg (${sign}${formatNumber(Math.abs(change.percent), 1)}%) in una settimana`;
}

export type WeightKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'comma' | 'delete';

export interface WeightInput {
  /** Il peso come si legge, con la virgola: "82,4". */
  text: string;
  /** La prossima cifra sostituisce il peso proposto. */
  replaceNext: boolean;
}

export function startWeightInput(kg?: number): WeightInput {
  if (kg === undefined) return { text: '', replaceNext: false };
  return { text: formatNumber(kg, 1).replace(/,0$/, ''), replaceNext: true };
}

const MAX_INTEGER_DIGITS = 3;

export function pressWeightKey(input: WeightInput, key: WeightKey): WeightInput {
  if (key === 'delete') {
    return { text: input.text.slice(0, -1), replaceNext: false };
  }
  const current = input.replaceNext ? '' : input.text;
  if (key === 'comma') {
    if (current.includes(',')) return { text: current, replaceNext: false };
    return { text: current === '' ? '0,' : `${current},`, replaceNext: false };
  }
  const [integer = '', decimals] = current.split(',');
  if (decimals !== undefined) {
    return { text: decimals.length >= 1 ? current : current + key, replaceNext: false };
  }
  if (integer === '0') return { text: key, replaceNext: false };
  if (integer.length >= MAX_INTEGER_DIGITS) return { text: current, replaceNext: false };
  return { text: current + key, replaceNext: false };
}

/** Il peso digitato in kg; null se è vuoto o fuori da 20–400 kg. */
export function weightFromInput(input: WeightInput): number | null {
  if (input.text === '') return null;
  const kg = Number(input.text.replace(',', '.'));
  return Number.isFinite(kg) && kg >= MIN_KG && kg <= MAX_KG ? kg : null;
}

export interface ChartPoint {
  /** Giorno nella finestra: 0 è il più vecchio, `days − 1` è la data finale. */
  index: number;
  kg: number;
}

export interface ChartSeries {
  points: ChartPoint[];
  average: ChartPoint[];
  min: number;
  max: number;
}

/**
 * Serie per il grafico degli ultimi `days` giorni che finiscono a `endDate`: le pesate, la
 * media mobile nei giorni in cui esiste e l'asse zoomato sull'intervallo reale con un margine.
 */
export function chartSeries(
  entries: readonly WeightPoint[],
  endDate: string,
  days = 30,
): ChartSeries {
  const points: ChartPoint[] = [];
  const average: ChartPoint[] = [];
  for (let index = 0; index < days; index++) {
    const date = addDays(endDate, index - (days - 1));
    const own = entries.find((entry) => entry.date === date);
    if (own) points.push({ index, kg: own.kg });
    const mean = movingAverage(entries, date);
    if (mean !== null) average.push({ index, kg: mean });
  }
  const values = [...points, ...average].map((point) => point.kg);
  if (values.length === 0) return { points, average, min: 0, max: 0 };
  const low = Math.min(...values);
  const high = Math.max(...values);
  const margin = Math.max((high - low) * 0.15, 0.5);
  return { points, average, min: low - margin, max: high + margin };
}
