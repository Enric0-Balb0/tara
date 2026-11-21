import { describe, expect, it } from 'vitest';

import { newId, uuidv7 } from './ids';

const FIXED = new Uint8Array(10).fill(0xab);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('ha la forma di un UUID versione 7 con la variante RFC 9562', () => {
    expect(uuidv7(1_795_000_000_000, FIXED)).toMatch(UUID);
  });

  it('i primi 48 bit sono i millisecondi, così gli id si ordinano per tempo', () => {
    const id = uuidv7(0x0123_4567_89ab, FIXED);
    expect(id.slice(0, 13)).toBe('01234567-89ab');
    expect(uuidv7(1000, FIXED) < uuidv7(1001, FIXED)).toBe(true);
  });

  it('usa i byte casuali dopo il tempo', () => {
    const a = uuidv7(1000, new Uint8Array(10).fill(0));
    const b = uuidv7(1000, new Uint8Array(10).fill(0xff));
    expect(a).not.toBe(b);
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
  });

  it('rifiuta meno di 10 byte casuali', () => {
    expect(() => uuidv7(1000, new Uint8Array(9))).toThrow('10 byte');
  });
});

describe('newId', () => {
  it('genera id diversi nello stesso millisecondo', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId(1000)));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID);
  });
});
