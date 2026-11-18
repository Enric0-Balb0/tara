/**
 * Client Supabase per l'accesso (Supabase Auth). La sessione resta nel localStorage di
 * expo-sqlite, così si resta dentro tra un avvio e l'altro; il rinnovo del token gira solo
 * con l'app in primo piano. Niente polyfill per URL: Expo lo installa già.
 * Colla di piattaforma, fuori dai test di Vitest: la logica dell'accesso è in
 * `src/domain/accesso.ts`.
 */
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/config';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: copy them from .env.example into .env.local and restart `npx expo start`.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Su Android e iOS la sessione non arriva da un URL: il codice si inserisce a mano.
    detectSessionInUrl: false,
  },
});

// Il ciclo di rinnovo continuerebbe anche in background: lo si accende e spegne con l'app.
// Il listener vive quanto il modulo, cioè quanto l'app.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
