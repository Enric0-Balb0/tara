/**
 * Righe dell'etichetta nutrizionale nell'ordine europeo (Reg. UE 1169/2011, allegato XV),
 * per 100 g o per la quantità scelta. Le chiavi sono i codici dei nutrienti del backend.
 */

import { type AmountKind, formatAmount } from './format';

export interface LabelRow {
  code: string;
  label: string;
  sub: boolean;
  value: string;
}

type Per100 = Readonly<Record<string, number | null | undefined>>;

const ROWS: readonly { code: string; label: string; sub: boolean; kind: AmountKind }[] = [
  { code: 'fat_g', label: 'Grassi', sub: false, kind: 'macro' },
  { code: 'sat_fat_g', label: 'di cui saturi', sub: true, kind: 'macro' },
  { code: 'carbs_g', label: 'Carboidrati', sub: false, kind: 'macro' },
  { code: 'sugars_g', label: 'di cui zuccheri', sub: true, kind: 'macro' },
  { code: 'fiber_g', label: 'Fibre', sub: false, kind: 'macro' },
  { code: 'protein_g', label: 'Proteine', sub: false, kind: 'macro' },
  { code: 'salt_g', label: 'Sale', sub: false, kind: 'salt' },
];

export function amountFor(per100: number | null, grams: number): number | null {
  return per100 === null ? null : (per100 * grams) / 100;
}

export function labelRows(per100: Per100, grams = 100): LabelRow[] {
  const at = (code: string) => amountFor(per100[code] ?? null, grams);
  const kj = formatAmount(at('energy_kj'), 'kj');
  const kcal = formatAmount(at('energy_kcal'), 'kcal');
  const energy = `${kj} kJ / ${kcal} kcal`;
  return [
    { code: 'energy', label: 'Energia', sub: false, value: energy },
    ...ROWS.map(({ code, label, sub, kind }) => {
      const amount = at(code);
      return {
        code,
        label,
        sub,
        value: amount === null ? formatAmount(null, kind) : `${formatAmount(amount, kind)} g`,
      };
    }),
  ];
}
