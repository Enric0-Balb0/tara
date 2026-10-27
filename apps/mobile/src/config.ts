/**
 * Indirizzo del backend. Expo inserisce EXPO_PUBLIC_API_URL nel bundle leggendolo da
 * `.env.local` (vedi `.env.example`); il default è il PC visto dall'emulatore Android.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000';
