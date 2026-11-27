import { formatAmount } from './format';

// Plurali che le regole regolari sbagliano; la chiave è il singolare in minuscolo.
const IRREGULAR: Readonly<Record<string, string>> = {
  uovo: 'uova',
  paio: 'paia',
  dito: 'dita',
};

/** Il plurale di una parola italiana: irregolari, poi -io→-i, -ca/-ga→-che/-ghe, -o→-i, -a→-e, -e→-i. */
function pluralWord(word: string): string {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR[lower];
  if (irregular !== undefined) {
    return word.charAt(0) === word.charAt(0).toUpperCase() && lower !== word
      ? irregular.charAt(0).toUpperCase() + irregular.slice(1)
      : irregular;
  }
  if (lower.endsWith('io')) return `${word.slice(0, -2)}i`;
  if (lower.endsWith('ca') || lower.endsWith('ga')) return `${word.slice(0, -1)}he`;
  if (lower.endsWith('o')) return `${word.slice(0, -1)}i`;
  if (lower.endsWith('a')) return `${word.slice(0, -1)}e`;
  if (lower.endsWith('e')) return `${word.slice(0, -1)}i`;
  // Consonante o vocale accentata ("yogurt", "caffè"): invariabile.
  return word;
}

/** Plurale del nome di una porzione: solo la prima parola ("fetta di pane" → "fette di pane"). */
export function pluralizeServing(name: string): string {
  const trimmed = name.trim();
  const space = trimmed.indexOf(' ');
  if (space === -1) return pluralWord(trimmed);
  return `${pluralWord(trimmed.slice(0, space))}${trimmed.slice(space)}`;
}

/**
 * Le scorciatoie del foglio dei grammi per una porzione: una e due, come "1 vasetto · 150 g"
 * e "2 vasetti · 300 g"; senza nome "1 porzione" e "2 porzioni" (RF-41).
 */
export function servingShortcuts(
  servingG: number,
  name: string | null = null,
  unit: 'g' | 'ml' = 'g',
): { label: string; grams: number }[] {
  if (!(servingG > 0)) return [];
  const single = name?.trim() ? name.trim() : 'porzione';
  const many = name?.trim() ? pluralizeServing(name) : 'porzioni';
  return [1, 2].map((count) => ({
    label: `${count} ${count === 1 ? single : many} · ${formatAmount(servingG * count, 'grams')} ${unit}`,
    grams: servingG * count,
  }));
}
