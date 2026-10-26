/**
 * Inserimento dei grammi dal tastierino (RF-41, RF-42), con la tara: si digita il peso
 * lordo e, se serve, il peso del contenitore, che viene sottratto.
 */

export type DigitKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type KeypadKey = DigitKey | 'tare' | 'delete';

export interface GramEntry {
  gross: string;
  tare: string;
  editing: 'weight' | 'tare';
  /** La prossima cifra sostituisce il campo: quantità proposta o campo appena riselezionato. */
  replaceNext: boolean;
}

export const MAX_DIGITS = 5;

export function startEntry(lastGrams?: number): GramEntry {
  return lastGrams === undefined
    ? { gross: '', tare: '', editing: 'weight', replaceNext: false }
    : { gross: String(Math.round(lastGrams)), tare: '', editing: 'weight', replaceNext: true };
}

function field(entry: GramEntry): 'gross' | 'tare' {
  return entry.editing === 'weight' ? 'gross' : 'tare';
}

export function pressKey(entry: GramEntry, key: KeypadKey): GramEntry {
  if (key === 'tare') {
    const editing = entry.editing === 'weight' ? 'tare' : 'weight';
    const target = editing === 'weight' ? entry.gross : entry.tare;
    return { ...entry, editing, replaceNext: target !== '' };
  }
  const name = field(entry);
  const current = entry.replaceNext ? '' : entry[name];
  if (key === 'delete') {
    return { ...entry, [name]: current.slice(0, -1), replaceNext: false };
  }
  if ((key === '0' && current === '') || current.length >= MAX_DIGITS) {
    return { ...entry, [name]: current, replaceNext: false };
  }
  return { ...entry, [name]: current + key, replaceNext: false };
}

function grams(digits: string): number {
  return digits === '' ? 0 : Number(digits);
}

export function netGrams(entry: GramEntry): number {
  return Math.max(grams(entry.gross) - grams(entry.tare), 0);
}

export function tareExceedsWeight(entry: GramEntry): boolean {
  // Senza peso non è ancora un errore: si può pesare prima il contenitore.
  return entry.gross !== '' && entry.tare !== '' && grams(entry.tare) >= grams(entry.gross);
}

export function canAdd(entry: GramEntry): boolean {
  return netGrams(entry) > 0;
}
