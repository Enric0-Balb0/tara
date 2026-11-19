import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Vitest copre la logica in TypeScript puro: dominio (src/domain), token del tema
// (src/theme) e strato dati (src/data, con SQLite vero grazie a node:sqlite).
// I componenti React Native si verificano sull'emulatore e con Maestro.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // scripts/: la logica pura dello script E2E (scripts/e2eFlows.mjs).
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/theme/**/*.ts', 'src/data/**/*.ts'],
      // useTheme usa React Native, fonts.ts i require dei .ttf: non girano in Node.
      // src/data/testing contiene solo gli strumenti dei test; supabase.ts è il client di
      // Supabase Auth, colla con expo-sqlite e AppState (la logica sta in domain/accesso.ts).
      exclude: [
        'src/**/*.test.ts',
        'src/theme/useTheme.ts',
        'src/theme/fonts.ts',
        'src/data/testing/**',
        'src/data/supabase.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
