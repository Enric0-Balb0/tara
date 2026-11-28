/**
 * Geometria della barra graduata (docs/design.md, "Componenti"): parte piena per il
 * registrato, tratteggio per il previsto dal piano, segno al traguardo. Oltre
 * l'obiettivo il binario si allunga, così l'eccesso resta visibile oltre il segno.
 */

export interface RulerGeometry {
  /** Frazioni del binario, tra 0 e 1. */
  logged: number;
  planned: number;
  /** Posizione del segno del traguardo; null senza obiettivo. */
  target: number | null;
}

export function rulerGeometry(
  logged: number,
  planned: number,
  target: number | null,
): RulerGeometry {
  const scale = Math.max(target ?? 0, logged + planned);
  if (scale === 0) return { logged: 0, planned: 0, target: target === null ? null : 1 };
  return {
    logged: logged / scale,
    planned: planned / scale,
    target: target === null ? null : target / scale,
  };
}

/**
 * Larghezza della parte piena: la frazione del binario, ma almeno `minimum` se c'è qualcosa
 * di registrato, così pochi grammi non diventano una scheggia illeggibile. Mai oltre il binario.
 */
export function visibleFill(fraction: number, width: number, minimum: number): number {
  if (fraction <= 0 || width <= 0) return 0;
  return Math.min(Math.max(fraction * width, minimum), width);
}

/** Le tacche ogni 10% che cadono dentro la parte piena (registrato più previsto), in frazioni. */
export function filledTicks(filled: number): number[] {
  const ticks: number[] = [];
  for (let tick = 1; tick <= 9; tick += 1) {
    if (tick / 10 < filled) ticks.push(tick / 10);
  }
  return ticks;
}
