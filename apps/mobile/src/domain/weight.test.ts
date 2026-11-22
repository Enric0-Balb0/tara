import { describe, expect, it } from 'vitest';

import {
  chartSeries,
  formatChange,
  movingAverage,
  pressWeightKey,
  proteinPerKg,
  startWeightInput,
  weeklyChange,
  weightFromInput,
} from './weight';

const w = (date: string, kg: number) => ({ date, kg });

describe('movingAverage', () => {
  it('fa la media delle pesate dei 7 giorni che finiscono alla data', () => {
    const entries = [w('2026-11-16', 82), w('2026-11-18', 83), w('2026-11-22', 84)];
    expect(movingAverage(entries, '2026-11-22')).toBeCloseTo(83, 10);
  });

  it('conta solo i giorni con una pesata, senza i giorni mancanti come zero', () => {
    expect(movingAverage([w('2026-11-20', 80), w('2026-11-22', 82)], '2026-11-22')).toBe(81);
  });

  it('con una sola pesata è quella pesata', () => {
    expect(movingAverage([w('2026-11-22', 82.4)], '2026-11-22')).toBe(82.4);
  });

  it('esclude il giorno prima della finestra e i giorni dopo la data', () => {
    const entries = [w('2026-11-15', 100), w('2026-11-16', 80), w('2026-11-23', 100)];
    expect(movingAverage(entries, '2026-11-22')).toBe(80);
  });

  it('è null se nella finestra non ci sono pesate', () => {
    expect(movingAverage([], '2026-11-22')).toBeNull();
    expect(movingAverage([w('2026-11-01', 80)], '2026-11-22')).toBeNull();
  });

  it('accetta una finestra diversa', () => {
    const entries = [w('2026-11-20', 80), w('2026-11-22', 82)];
    expect(movingAverage(entries, '2026-11-22', 2)).toBe(82);
    expect(movingAverage(entries, '2026-11-22', 3)).toBe(81);
  });
});

describe('weeklyChange', () => {
  it('confronta la media di oggi con quella di sette giorni prima', () => {
    const entries = [w('2026-11-15', 82.5), w('2026-11-22', 82.1)];
    const change = weeklyChange(entries, '2026-11-22');
    expect(change?.kg).toBeCloseTo(-0.4, 10);
    expect(change?.percent).toBeCloseTo((-0.4 / 82.5) * 100, 10);
  });

  it('è positiva se il peso sale', () => {
    const change = weeklyChange([w('2026-11-15', 80), w('2026-11-22', 80.8)], '2026-11-22');
    expect(change?.kg).toBeCloseTo(0.8, 10);
    expect(change?.percent).toBeCloseTo(1, 10);
  });

  it('è null se manca la media di oggi o quella di una settimana fa', () => {
    expect(weeklyChange([w('2026-11-22', 82)], '2026-11-22')).toBeNull();
    expect(weeklyChange([w('2026-11-15', 82)], '2026-11-22')).toBeNull();
    expect(weeklyChange([], '2026-11-22')).toBeNull();
  });
});

describe('proteinPerKg', () => {
  it('divide le proteine per la media', () => {
    expect(proteinPerKg(180, 90)).toBe(2);
    expect(proteinPerKg(0, 90)).toBe(0);
  });

  it('è null senza media o con una media non valida', () => {
    expect(proteinPerKg(180, null)).toBeNull();
    expect(proteinPerKg(180, 0)).toBeNull();
  });
});

describe('formatChange', () => {
  it('scrive segno, kg e percentuale con la virgola', () => {
    expect(formatChange({ kg: -0.4, percent: -0.48 })).toBe('−0,4 kg (−0,5%) in una settimana');
    expect(formatChange({ kg: 0.8, percent: 1 })).toBe('+0,8 kg (+1,0%) in una settimana');
  });

  it('dice invariato se si arrotonda a zero', () => {
    expect(formatChange({ kg: 0.02, percent: 0.02 })).toBe('Invariato in una settimana');
  });
});

describe('tastierino del peso', () => {
  function type(keys: Parameters<typeof pressWeightKey>[1][], from = startWeightInput()) {
    return keys.reduce(pressWeightKey, from);
  }

  it('scrive 82,4 con la virgola', () => {
    const input = type(['8', '2', 'comma', '4']);
    expect(input.text).toBe('82,4');
    expect(weightFromInput(input)).toBe(82.4);
  });

  it('un solo decimale e al massimo tre cifre intere', () => {
    expect(type(['8', '2', 'comma', '4', '5']).text).toBe('82,4');
    expect(type(['1', '2', '3', '4']).text).toBe('123');
  });

  it('una seconda virgola si ignora; la virgola per prima scrive 0,', () => {
    expect(type(['8', 'comma', 'comma']).text).toBe('8,');
    expect(type(['comma']).text).toBe('0,');
  });

  it('cancella una cifra alla volta', () => {
    expect(type(['8', '2', 'comma', '4', 'delete', 'delete']).text).toBe('82');
    expect(type(['delete']).text).toBe('');
  });

  it('lo zero iniziale è sostituito dalla cifra seguente', () => {
    expect(type(['0', '5']).text).toBe('5');
    expect(type(['0', '0']).text).toBe('0');
  });

  it('partendo da un peso la prima cifra lo sostituisce', () => {
    expect(startWeightInput(82.4).text).toBe('82,4');
    expect(startWeightInput(82).text).toBe('82');
    expect(type(['7'], startWeightInput(82.4)).text).toBe('7');
    expect(type(['delete'], startWeightInput(82.4)).text).toBe('82,');
  });

  it('il peso vale solo tra 20 e 400 kg', () => {
    expect(weightFromInput(type(['1', '9']))).toBeNull();
    expect(weightFromInput(type(['4', '0', '1']))).toBeNull();
    expect(weightFromInput(type(['2', '0']))).toBe(20);
    expect(weightFromInput(type(['8', '2', 'comma']))).toBe(82);
    expect(weightFromInput(startWeightInput())).toBeNull();
  });
});

describe('chartSeries', () => {
  it('mette pesate e media sui giorni degli ultimi 30, con il giorno di oggi a destra', () => {
    const entries = [w('2026-10-24', 82), w('2026-11-22', 83)];
    const series = chartSeries(entries, '2026-11-22', 30);
    expect(series.points).toEqual([
      { index: 0, kg: 82 },
      { index: 29, kg: 83 },
    ]);
    expect(series.average.at(0)).toEqual({ index: 0, kg: 82 });
    expect(series.average.at(-1)).toEqual({ index: 29, kg: 83 });
  });

  it('la media usa anche le pesate prima della finestra', () => {
    const series = chartSeries([w('2026-10-22', 90), w('2026-10-24', 80)], '2026-11-22', 30);
    expect(series.points).toEqual([{ index: 0, kg: 80 }]);
    expect(series.average[0]?.kg).toBe(85);
  });

  it("l'asse è zoomato sull'intervallo reale con un po' di margine", () => {
    const series = chartSeries([w('2026-11-20', 82), w('2026-11-22', 83)], '2026-11-22', 30);
    expect(series.min).toBeLessThan(82);
    expect(series.max).toBeGreaterThan(83);
    expect(series.max - series.min).toBeLessThan(5);
  });

  it("con un solo valore l'asse ha comunque un intervallo", () => {
    const series = chartSeries([w('2026-11-22', 82)], '2026-11-22', 30);
    expect(series.max).toBeGreaterThan(series.min);
  });

  it('senza pesate è vuota', () => {
    const series = chartSeries([], '2026-11-22', 30);
    expect(series.points).toEqual([]);
    expect(series.average).toEqual([]);
  });
});
