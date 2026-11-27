/**
 * Form dell'etichetta per un alimento inserito a mano (RF-18), con i controlli di RF-15 e
 * RF-16. Le righe sono quelle della tabella nutrizionale europea (Reg. UE 1169/2011,
 * allegato XV), nello stesso ordine, e i valori sono per 100 g o 100 ml.
 */

import { formatNumber } from './format';
import { checkDeclaredKcal, sodiumMgFromSaltG } from './nutrition';

export interface LabelField {
  code: string;
  label: string;
  unit: string;
  /** Riga "di cui" o kcal sotto i kJ: rientrata, come sull'etichetta. */
  sub: boolean;
  /** Il "di cui" non può superare la riga che lo contiene. */
  partOf?: string;
}

export const LABEL_FIELDS: readonly LabelField[] = [
  { code: 'energy_kj', label: 'Energia', unit: 'kJ', sub: false },
  { code: 'energy_kcal', label: 'kcal', unit: 'kcal', sub: true },
  { code: 'fat_g', label: 'Grassi', unit: 'g', sub: false },
  { code: 'sat_fat_g', label: 'di cui saturi', unit: 'g', sub: true, partOf: 'fat_g' },
  { code: 'carbs_g', label: 'Carboidrati', unit: 'g', sub: false },
  { code: 'sugars_g', label: 'di cui zuccheri', unit: 'g', sub: true, partOf: 'carbs_g' },
  { code: 'fiber_g', label: 'Fibre', unit: 'g', sub: false },
  { code: 'protein_g', label: 'Proteine', unit: 'g', sub: false },
  { code: 'salt_g', label: 'Sale', unit: 'g', sub: false },
];

/** Senza questi l'alimento non si può registrare (RF-12): le kcal possono venire dai kJ. */
const REQUIRED: Readonly<Record<string, string>> = {
  energy_kcal: 'Servono le kcal',
  fat_g: 'Servono i grassi',
  carbs_g: 'Servono i carboidrati',
  protein_g: 'Servono le proteine',
};

/** Il "di cui" e il suo totale, per il messaggio. */
const PART_OF_NAMES: Readonly<Record<string, string>> = {
  fat_g: 'Più dei grassi',
  carbs_g: 'Più dei carboidrati',
};

/** Le righe in grammi che, insieme, non possono superare 100 g in 100 g. */
const MASS_CODES = ['fat_g', 'carbs_g', 'fiber_g', 'protein_g', 'salt_g'] as const;

const KJ_PER_KCAL = 4.184;
/** Massimi plausibili per 100 g: oltre, è un errore di battitura. */
const MAX: Readonly<Record<string, number>> = { energy_kj: 3800, energy_kcal: 900 };
const MAX_GRAMS = 100;

export type FoodTexts = Record<string, string>;

export function emptyFoodTexts(): FoodTexts {
  return Object.fromEntries(LABEL_FIELDS.map((field) => [field.code, '']));
}

/**
 * I valori salvati come testo del form: virgola decimale, niente zeri in coda. Un valore
 * ricavato da un altro (`derived`, i kJ dalle kcal) torna vuoto: se cambia quello scritto,
 * si ricalcola invece di restare quello di prima.
 */
export function foodTextsOf(
  values: Readonly<Record<string, number | null | undefined>>,
  derived: readonly string[],
): FoodTexts {
  return Object.fromEntries(
    LABEL_FIELDS.map((field) => {
      const value = values[field.code];
      if (value === null || value === undefined || derived.includes(field.code)) {
        return [field.code, ''];
      }
      const decimals = Number.isInteger(value) ? 0 : Number.isInteger(value * 10) ? 1 : 2;
      return [field.code, formatNumber(value, decimals)];
    }),
  );
}

/** Un valore dell'etichetta: '' è null (manca), un testo non valido è undefined. */
export function parseLabelValue(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) return undefined;
  return Number(trimmed.replace(',', '.'));
}

export interface FoodForm {
  ok: boolean;
  /** Valori per 100 da salvare: un campo vuoto non c'è (principio 2). */
  values: Record<string, number>;
  /** I codici dei valori ricavati da altri (kcal dai kJ o viceversa, sodio dal sale). */
  derived: string[];
  /** Per campo (codice del nutriente), `name` per il nome e `total` per la somma. */
  errors: Record<string, string>;
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function readFoodForm(name: string, texts: FoodTexts): FoodForm {
  const errors: Record<string, string> = {};
  const values: Record<string, number> = {};
  const derived: string[] = [];
  if (name.trim() === '') errors.name = 'Scrivi il nome';

  for (const field of LABEL_FIELDS) {
    const value = parseLabelValue(texts[field.code] ?? '');
    const max = MAX[field.code] ?? MAX_GRAMS;
    if (value === undefined || (value !== null && value > max)) {
      errors[field.code] = 'Numero non valido';
    } else if (value !== null) values[field.code] = value;
  }

  // Le due energie dell'etichetta si ricavano l'una dall'altra.
  const { energy_kj: kj, energy_kcal: kcal } = values;
  if (kcal === undefined && kj !== undefined && !errors.energy_kcal) {
    values.energy_kcal = Math.round(kj / KJ_PER_KCAL);
    derived.push('energy_kcal');
  }
  if (kj === undefined && kcal !== undefined && !errors.energy_kj) {
    values.energy_kj = Math.round(kcal * KJ_PER_KCAL);
    derived.push('energy_kj');
  }

  for (const [code, message] of Object.entries(REQUIRED)) {
    if (values[code] === undefined && !errors[code]) errors[code] = message;
  }

  for (const field of LABEL_FIELDS) {
    const part = values[field.code];
    const whole = field.partOf ? values[field.partOf] : undefined;
    if (field.partOf && part !== undefined && whole !== undefined && part > whole) {
      errors[field.code] = PART_OF_NAMES[field.partOf] ?? 'Più del totale';
    }
  }

  const mass = MASS_CODES.reduce((sum, code) => sum + (values[code] ?? 0), 0);
  if (mass > MAX_GRAMS) errors.total = 'Più di 100 g di nutrienti in 100 g: ricontrolla i valori';

  // RF-16: le etichette UE riportano il sale, il sodio si ricava.
  if (values.salt_g !== undefined) {
    values.sodium_mg = round(sodiumMgFromSaltG(values.salt_g), 1);
    derived.push('sodium_mg');
  }

  return { ok: Object.keys(errors).length === 0, values, derived, errors };
}

/**
 * RF-15: le kcal dichiarate contro quelle dai macro (4, 4, 9 e 2 per le fibre). È un avviso,
 * non un blocco: polioli e alcol, se l'etichetta li ha, spostano il conto.
 */
export function kcalCheckText(
  values: Readonly<Record<string, number | undefined>>,
): { ok: boolean; text: string } | null {
  const { energy_kcal: kcal, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG } = values;
  if (kcal === undefined || proteinG === undefined || carbsG === undefined || fatG === undefined) {
    return null;
  }
  const check = checkDeclaredKcal(kcal, {
    proteinG,
    carbsG,
    fatG,
    ...(values.fiber_g !== undefined ? { fiberG: values.fiber_g } : {}),
  });
  const numbers = `${formatNumber(kcal, 0)} dichiarate, ${formatNumber(check.expectedKcal, 0)} calcolate.`;
  return check.ok
    ? { ok: true, text: `Le calorie tornano con i macro: ${numbers}` }
    : {
        ok: false,
        text: `Le calorie non tornano con i macro: ${numbers} Ricontrolla l'etichetta.`,
      };
}

export interface ServingForm {
  ok: boolean;
  /** La porzione da salvare; null se i due campi sono vuoti. */
  serving: { grams: number; name: string | null } | null;
  errors: { name?: string; grams?: string };
}

/** La porzione facoltativa: grammi > 0, il nome da solo non vale (RF-02). */
export function readServing(nameText: string, gramsText: string): ServingForm {
  const name = nameText.trim();
  const grams = parseLabelValue(gramsText);
  if (grams === undefined || (grams !== null && grams <= 0)) {
    return { ok: false, serving: null, errors: { grams: 'Scrivi un numero maggiore di zero.' } };
  }
  if (grams === null) {
    if (name === '') return { ok: true, serving: null, errors: {} };
    return { ok: false, serving: null, errors: { grams: 'Servono i grammi della porzione.' } };
  }
  return { ok: true, serving: { grams, name: name === '' ? null : name }, errors: {} };
}
