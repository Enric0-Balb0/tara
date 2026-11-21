import { beforeEach, describe, expect, it } from 'vitest';

import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import {
  addDayType,
  dayTypeFor,
  deleteDayType,
  ensureDayTypes,
  renameDayType,
  setDayType,
  setTarget,
  targetOn,
} from './targetsStore';
import { openTestDatabase } from './testing/nodeDatabase';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-21T12:30:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const FULL = { kcal: 2800, protein_g: 240, carbs_g: 300, fat_g: 70 };

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

async function typeNamed(name: string, user = USER) {
  const types = await ensureDayTypes(db, user, NOW);
  const found = types.find((t) => t.name === name);
  if (!found) throw new Error(`manca ${name}`);
  return found;
}

describe('tipi di giornata', () => {
  it('la prima volta crea Allenamento e Riposo, poi non li duplica', async () => {
    const first = await ensureDayTypes(db, USER, NOW);
    expect(first.map((t) => [t.name, t.position])).toEqual([
      ['Allenamento', 0],
      ['Riposo', 1],
    ]);
    const again = await ensureDayTypes(db, USER, later(1));
    expect(again.map((t) => t.id)).toEqual(first.map((t) => t.id));
  });

  it('si aggiungono in fondo, si rinominano e si eliminano', async () => {
    await ensureDayTypes(db, USER, NOW);
    const high = await addDayType(db, USER, 'High', later(1));
    expect(high.position).toBe(2);
    await renameDayType(db, USER, high.id, 'Ricarica', later(2));
    await deleteDayType(db, USER, (await typeNamed('Riposo')).id, later(3));
    const types = await ensureDayTypes(db, USER, later(4));
    expect(types.map((t) => t.name)).toEqual(['Allenamento', 'Ricarica']);
  });

  it("l'ultimo tipo non si elimina: una giornata ha sempre un tipo", async () => {
    await ensureDayTypes(db, USER, NOW);
    await deleteDayType(db, USER, (await typeNamed('Riposo')).id, later(1));
    await expect(
      deleteDayType(db, USER, (await typeNamed('Allenamento')).id, later(2)),
    ).rejects.toThrow('ultimo tipo');
  });

  it('un altro utente non tocca i miei tipi', async () => {
    const riposo = await typeNamed('Riposo');
    await renameDayType(db, OTHER, riposo.id, 'Rubato', later(1));
    await deleteDayType(db, OTHER, riposo.id, later(2)).catch(() => undefined);
    expect((await ensureDayTypes(db, USER, later(3))).map((t) => t.name)).toEqual([
      'Allenamento',
      'Riposo',
    ]);
  });
});

describe('tipo assegnato a un giorno (RF-51)', () => {
  it('senza assegnazione vale il primo tipo; poi quello scelto', async () => {
    const allenamento = await typeNamed('Allenamento');
    const riposo = await typeNamed('Riposo');
    expect(await dayTypeFor(db, USER, '2026-11-21')).toBe(allenamento.id);
    await setDayType(db, USER, '2026-11-21', riposo.id, NOW);
    expect(await dayTypeFor(db, USER, '2026-11-21')).toBe(riposo.id);
    await setDayType(db, USER, '2026-11-21', allenamento.id, later(1));
    expect(await dayTypeFor(db, USER, '2026-11-21')).toBe(allenamento.id);
    expect(await dayTypeFor(db, USER, '2026-11-22')).toBe(allenamento.id);
  });

  it('un giorno assegnato a un tipo eliminato torna al primo tipo', async () => {
    const riposo = await typeNamed('Riposo');
    await setDayType(db, USER, '2026-11-21', riposo.id, NOW);
    await deleteDayType(db, USER, riposo.id, later(1));
    expect(await dayTypeFor(db, USER, '2026-11-21')).toBe((await typeNamed('Allenamento')).id);
  });
});

describe('target con storico (RF-50, RF-53)', () => {
  it('un target vale dal suo giorno in poi e non cambia i giorni prima', async () => {
    const allenamento = await typeNamed('Allenamento');
    await setTarget(db, USER, allenamento.id, '2026-11-01', { ...FULL, kcal: 2600 }, NOW);
    await setTarget(db, USER, allenamento.id, '2026-11-21', FULL, later(1));
    expect((await targetOn(db, USER, allenamento.id, '2026-11-20'))?.kcal).toBe(2600);
    expect(await targetOn(db, USER, allenamento.id, '2026-11-21')).toMatchObject(FULL);
    expect(await targetOn(db, USER, allenamento.id, '2026-10-31')).toBeUndefined();
  });

  it('cambiare il target lo stesso giorno lo corregge invece di aggiungerne un altro', async () => {
    const allenamento = await typeNamed('Allenamento');
    await setTarget(db, USER, allenamento.id, '2026-11-21', FULL, NOW);
    await setTarget(db, USER, allenamento.id, '2026-11-21', { ...FULL, kcal: 2900 }, later(1));
    const rows = await db.getAllAsync('SELECT id FROM day_type_target WHERE deleted_at IS NULL');
    expect(rows).toHaveLength(1);
    expect((await targetOn(db, USER, allenamento.id, '2026-11-21'))?.kcal).toBe(2900);
  });

  it('i valori vuoti restano vuoti, non zero', async () => {
    const riposo = await typeNamed('Riposo');
    await setTarget(
      db,
      USER,
      riposo.id,
      '2026-11-21',
      { kcal: 2200, protein_g: 220, carbs_g: null, fat_g: null },
      NOW,
    );
    expect(await targetOn(db, USER, riposo.id, '2026-11-21')).toMatchObject({
      kcal: 2200,
      carbs_g: null,
      fat_g: null,
    });
  });

  it('i target di un altro utente non si vedono', async () => {
    const allenamento = await typeNamed('Allenamento');
    await setTarget(db, USER, allenamento.id, '2026-11-21', FULL, NOW);
    expect(await targetOn(db, OTHER, allenamento.id, '2026-11-21')).toBeUndefined();
  });
});

describe('vincoli del database', () => {
  it('rifiuta un target negativo', async () => {
    const allenamento = await typeNamed('Allenamento');
    await expect(
      db.runAsync(
        `INSERT INTO day_type_target (id, user_id, day_type_id, valid_from, kcal, updated_at)
         VALUES ('t1', ?, ?, '2026-11-21', -1, ?)`,
        USER,
        allenamento.id,
        NOW.toISOString(),
      ),
    ).rejects.toThrow(/day_type_target_values_non_negative/);
  });

  it('rifiuta un tipo di giornata senza nome', async () => {
    await expect(
      db.runAsync(
        "INSERT INTO day_type (id, user_id, name, position, updated_at) VALUES ('d1', ?, ' ', 0, ?)",
        USER,
        NOW.toISOString(),
      ),
    ).rejects.toThrow(/day_type_name_not_blank/);
  });

  it('rifiuta una data che non è AAAA-MM-GG', async () => {
    const allenamento = await typeNamed('Allenamento');
    await expect(setDayType(db, USER, '21/11/2026', allenamento.id, NOW)).rejects.toThrow(
      /day_plan_date_valid/,
    );
  });
});
