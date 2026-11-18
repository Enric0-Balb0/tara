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

// Supabase Auth: URL e chiave publishable sono pubblici per costruzione (finiscono nel
// bundle e li protegge la sicurezza per riga). Una chiave segreta qui darebbe a chiunque
// abbia l'app l'accesso completo al database.
const supabase = (profile: string) => ({
  url: eas.build[profile]?.env?.EXPO_PUBLIC_SUPABASE_URL,
  key: eas.build[profile]?.env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

describe('Supabase nelle build EAS', () => {
  it.each(['preview', 'production'])('il profilo %s ha URL https e chiave publishable', (profile) => {
    const { url, key } = supabase(profile);
    expect(url, `manca EXPO_PUBLIC_SUPABASE_URL nel profilo ${profile}`).toBeDefined();
    expect(new URL(url ?? '').protocol).toBe('https:');
    expect(key, `manca EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY nel profilo ${profile}`).toMatch(
      /^sb_publishable_/,
    );
  });

  it('preview e production usano lo stesso progetto', () => {
    expect(supabase('preview')).toEqual(supabase('production'));
  });

  it('nessuna chiave segreta né service_role in eas.json o in .env.example', () => {
    // I commenti di .env.example nominano le chiavi segrete per vietarle: contano i valori.
    const values = envExample.split('\n').filter((line) => !line.trimStart().startsWith('#'));
    const sources = [JSON.stringify(eas), ...values].join('\n');
    expect(sources).not.toMatch(/sb_secret_/);
    expect(sources).not.toMatch(/service_role/);
  });

  it('.env.example documenta le stesse variabili', () => {
    expect(envExample).toMatch(/^EXPO_PUBLIC_SUPABASE_URL=https:\/\//m);
    expect(envExample).toMatch(/^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_/m);
  });
});
