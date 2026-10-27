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
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/theme/**/*.ts', 'src/data/**/*.ts'],
      // useTheme usa React Native, fonts.ts i require dei .ttf: non girano in Node.
      // src/data/testing contiene solo gli strumenti dei test.
      exclude: [
        'src/**/*.test.ts',
        'src/theme/useTheme.ts',
        'src/theme/fonts.ts',
        'src/data/testing/**',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
