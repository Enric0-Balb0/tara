import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type EasJson = { build: Record<string, { env?: Record<string, string> } | undefined> };

// Le build EAS non leggono .env.local: l'indirizzo del backend arriva dai profili di eas.json.
// Se manca, src/config.ts ripiega in silenzio sull'emulatore e l'app non trova il catalogo;
// se è in chiaro, le build preview e production bloccano le richieste.
const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')) as EasJson;
const apiUrl = (profile: string) => eas.build[profile]?.env?.EXPO_PUBLIC_API_URL;

describe('indirizzo del backend nelle build EAS', () => {
  it.each(['preview', 'production'])('il profilo %s usa il backend online in https', (profile) => {
    const value = apiUrl(profile);
    expect(value, `manca EXPO_PUBLIC_API_URL nel profilo ${profile}`).toBeDefined();
    expect(new URL(value ?? '').protocol).toBe('https:');
  });

  it('preview e production parlano con lo stesso backend', () => {
    expect(apiUrl('preview')).toBe(apiUrl('production'));
  });

  it('la development build resta sul backend locale', () => {
    expect(apiUrl('development')).toBeUndefined();
  });
});
