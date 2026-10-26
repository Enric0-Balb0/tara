/**
 * Movimento (docs/design.md, "Movimento e vibrazione"): ogni animazione risponde a un
 * gesto. Con il movimento ridotto del telefono restano solo dissolvenze brevi.
 */

export const durations = {
  press: 100,
  quick: 160,
  sheetIn: 240,
  sheetOut: 200,
  entry: 200,
} as const;

/** Parametri di cubic-bezier. */
export const curves = {
  standard: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const PRESS_SCALE = 0.97;
