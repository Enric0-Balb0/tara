/**
 * Chiave di ricerca dei nomi degli alimenti: senza accenti, in minuscolo, con gli spazi
 * compressi. Si applica ai nomi quando si salvano e alla ricerca quando si digita, così
 * "caffe" trova "Caffè" come nel backend (unaccent).
 */

// Segni diacritici combinanti dopo la scomposizione NFD. Un intervallo esplicito e non
// \p{M}: Hermes non garantisce le classi Unicode nelle espressioni regolari.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function searchKey(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function searchWords(query: string): string[] {
  const key = searchKey(query);
  return key === '' ? [] : key.split(' ');
}
