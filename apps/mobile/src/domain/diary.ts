import { formatAmount } from './format';

/**
 * Diario (RF-40, RF-43, RF-45): pasti del giorno, date locali, quantità e totali.
 * Ogni voce porta con sé una copia dei valori per 100 del momento in cui è stata
 * registrata, così cambiare un alimento non riscrive il passato (principio 7), e un
 * nutriente senza valore resta senza valore anche nei totali (principio 2).
 */

/** I pasti che il diario crea la prima volta; poi si possono cambiare (decisione di Enrico). */
export const DEFAULT_MEAL_SLOTS: readonly { name: string; time: string }[] = [
  { name: 'Colazione', time: '07:30' },
  { name: 'Spuntino', time: '10:30' },
  { name: 'Pranzo', time: '13:00' },
  { name: 'Merenda', time: '16:30' },
  { name: 'Cena', time: '20:00' },
];

export interface SlotRef {
  id: string;
  name: string;
  position: number;
  /** Orario tipico "HH:MM", se c'è. */
  expectedTime: string | null;
}

/** Minuti dalla mezzanotte di un orario "HH:MM". */
export function minutesOfDay(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Il pasto a cui va una voce aggiunta senza sceglierlo: quello con l'orario più vicino.
 * A parità di distanza vince il successivo, perché si sta andando verso quel pasto.
 */
export function slotForTime<T extends SlotRef>(
  slots: readonly T[],
  minutes: number,
): T | undefined {
  let best: T | undefined;
  let bestDistance = Infinity;
  for (const slot of slots) {
    if (slot.expectedTime === null) continue;
    const distance = Math.abs(minutesOfDay(slot.expectedTime) - minutes);
    if (distance <= bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best ?? slots[0];
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

/** La data locale del telefono come "AAAA-MM-GG": il giorno del diario è quello di chi mangia. */
export function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

function parseDate(date: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  // In UTC: il cambio dell'ora legale non sposta i giorni.
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: string, days: number): string {
  const result = parseDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return `${result.getUTCFullYear()}-${twoDigits(result.getUTCMonth() + 1)}-${twoDigits(result.getUTCDate())}`;
}

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

/** "giovedì 19 novembre": la data per esteso, senza Intl (Hermes non ha l'italiano garantito). */
export function dayLabel(date: string): string {
  const parsed = parseDate(date);
  return `${WEEKDAYS[parsed.getUTCDay()] ?? ''} ${parsed.getUTCDate()} ${MONTHS[parsed.getUTCMonth()] ?? ''}`;
}

/** "1 alimento", "3 alimenti": quanti alimenti ha un pasto salvato. */
export function foodCountLabel(count: number): string {
  return count === 1 ? '1 alimento' : `${count} alimenti`;
}

/**
 * Nome proposto per un pasto salvato (RF-30): «Pranzo del 21 novembre», senza il giorno della
 * settimana. Con l'elisione dell'italiano: «dell'8 marzo», «dell'11 aprile», «del 1° maggio».
 */
export function defaultSavedMealName(slotName: string, date: string): string {
  const parsed = parseDate(date);
  const day = parsed.getUTCDate();
  const month = MONTHS[parsed.getUTCMonth()] ?? '';
  const of = day === 1 ? 'del 1°' : day === 8 || day === 11 ? `dell'${day}` : `del ${day}`;
  return `${slotName} ${of} ${month}`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Intestazione di Oggi: un titolo corto e la data sotto. "Oggi", "Ieri", "Domani" con la data
 * per esteso; gli altri giorni il giorno della settimana come titolo e la data sotto, così il
 * titolo resta corto. L'anno solo se non è quello di oggi.
 */
export function dayHeading(date: string, today: string): { title: string; subtitle: string } {
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`;
  const relative =
    date === today
      ? 'Oggi'
      : date === addDays(today, -1)
        ? 'Ieri'
        : date === addDays(today, 1)
          ? 'Domani'
          : null;
  if (relative !== null) return { title: relative, subtitle: `${dayLabel(date)}${year}` };
  const parsed = parseDate(date);
  return {
    title: capitalize(WEEKDAYS[parsed.getUTCDay()] ?? ''),
    subtitle: `${parsed.getUTCDate()} ${MONTHS[parsed.getUTCMonth()] ?? ''}${year}`,
  };
}

export interface SnapshotValue {
  amount: number;
  provenance: string;
  confidence: number;
}

/** Valori per 100 g o 100 ml al momento della registrazione: solo i nutrienti noti. */
export type NutrientSnapshot = Readonly<Record<string, SnapshotValue>>;

export function snapshotFrom(
  nutrients: readonly {
    code: string;
    amountPer100: number;
    provenance: string;
    confidence: number;
  }[],
): Record<string, SnapshotValue> {
  const snapshot: Record<string, SnapshotValue> = {};
  for (const nutrient of nutrients) {
    snapshot[nutrient.code] = {
      amount: nutrient.amountPer100,
      provenance: nutrient.provenance,
      confidence: nutrient.confidence,
    };
  }
  return snapshot;
}

/** Quanto di un nutriente c'è in una voce; null se il valore non è noto. */
export function entryAmount(
  snapshot: NutrientSnapshot,
  code: string,
  quantity: number,
): number | null {
  const value = snapshot[code];
  return value === undefined ? null : (value.amount * quantity) / 100;
}

/** I nutrienti del riepilogo di "Oggi". */
export const DIARY_NUTRIENTS = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g'] as const;
export type DiaryNutrient = (typeof DIARY_NUTRIENTS)[number];

export interface Total {
  amount: number;
  /** Almeno una voce non ha questo valore: il totale è un minimo, non il valore vero. */
  incomplete: boolean;
}

/** "≥" quando qualche voce non ha il valore: il totale è un minimo (principio 2). */
export function formatTotal(total: Total, kind: 'kcal' | 'macro'): string {
  return `${total.incomplete ? '≥ ' : ''}${formatAmount(total.amount, kind)}`;
}

export function totals(
  entries: readonly { quantity: number; snapshot: NutrientSnapshot }[],
): Record<DiaryNutrient, Total> {
  const result = {} as Record<DiaryNutrient, Total>;
  for (const code of DIARY_NUTRIENTS) {
    let amount = 0;
    let incomplete = false;
    for (const entry of entries) {
      const value = entryAmount(entry.snapshot, code, entry.quantity);
      if (value === null) incomplete = true;
      else amount += value;
    }
    result[code] = { amount, incomplete };
  }
  return result;
}

/**
 * Un pasto rispetto al piano (RF-130, docs/design.md "Intestazione del pasto"): "2 di 3" le
 * voci del piano confermate; completo quando il piano è tutto confermato e il pasto non ha
 * altre voci, e allora si chiude in una riga ("3 di 3, come da piano").
 */
export function mealPlanStatus(
  planIds: readonly string[],
  entryPlanIds: readonly (string | null)[],
): { progress: string | null; complete: boolean } {
  if (planIds.length === 0) return { progress: null, complete: false };
  // Una voce del piano conta se una voce del pasto la conferma: si guarda voce per voce, non
  // per numeri, così le conferme di un altro piano (tipo cambiato) restano voci in più.
  const confirmed = planIds.filter((id) => entryPlanIds.includes(id)).length;
  const complete = confirmed === planIds.length && entryPlanIds.length === confirmed;
  return {
    progress: `${confirmed} di ${planIds.length}${complete ? ', come da piano' : ''}`,
    complete,
  };
}
