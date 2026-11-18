/**
 * Indirizzo del backend. Expo inserisce EXPO_PUBLIC_API_URL nel bundle leggendolo da
 * `.env.local` (vedi `.env.example`); il default è il PC visto dall'emulatore Android.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000';

/**
 * Progetto Supabase per l'accesso. Pubblici per costruzione (chiave `sb_publishable_`,
 * mai `sb_secret_`): le build EAS li prendono da eas.json, `npx expo start` da `.env.local`.
 * Vuoti se mancano: è `src/data/supabase.ts` a fermarsi con un errore chiaro.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
