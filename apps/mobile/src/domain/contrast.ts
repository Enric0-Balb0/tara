/**
 * Contrasto tra colori secondo WCAG 2.x. Verifica i token del tema e corregge i colori
 * dei macro scelti dall'utente (RF-59), che devono restare leggibili.
 */

function parseHex(hex: string): [number, number, number] {
  const digits = hex.replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminanza relativa, tra 0 (nero) e 1 (bianco). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Rapporto di contrasto, tra 1 e 21; l'ordine dei colori non conta. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Il colore stesso se raggiunge `min` sullo sfondo; altrimenti il primo mescolato verso
 * il bianco (sfondo scuro) o verso il nero (sfondo chiaro), a passi del 5%.
 */
export function ensureContrast(color: string, background: string, min = 4.5): string {
  if (contrastRatio(color, background) >= min) return toHex(parseHex(color));
  const target = relativeLuminance(background) < 0.5 ? 255 : 0;
  const rgb = parseHex(color);
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const mixed = toHex(rgb.map((c) => c + (target - c) * t) as [number, number, number]);
    if (contrastRatio(mixed, background) >= min) return mixed;
  }
  return toHex([target, target, target]);
}
