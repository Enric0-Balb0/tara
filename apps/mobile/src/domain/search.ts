/**
 * Chiave di ricerca dei nomi degli alimenti: senza accenti, in minuscolo, con gli spazi
 * compressi. Si applica ai nomi quando si salvano e alla ricerca quando si digita, così
 * "caffe" trova "Caffè" come nel backend (unaccent).
 */

// Segni diacritici combinanti dopo la scomposizione NFD. Un intervallo esplicito e non
// \p{M}: Hermes non garantisce le classi Unicode nelle espressioni regolari.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

// Ciò che NFD non riduce a lettere semplici, come fa unaccent: l'apostrofo tipografico
// della tastiera iOS ("d’uovo") e le legature.
const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/[\u2018\u2019\u02bc]/g, "'"],
  [/\u0153/g, 'oe'],
  [/\u00e6/g, 'ae'],
  [/\u00df/g, 'ss'],
  [/\u00f8/g, 'o'],
];

/** Più corta di così, dopo searchKey, una ricerca troverebbe quasi tutto. */
export const MIN_QUERY_LENGTH = 2;

export function searchKey(text: string): string {
  let key = text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
  for (const [pattern, replacement] of REPLACEMENTS) key = key.replace(pattern, replacement);
  return key.replace(/\s+/g, ' ').trim();
}

export function searchWords(query: string): string[] {
  const key = searchKey(query);
  return key === '' ? [] : key.split(' ');
}
