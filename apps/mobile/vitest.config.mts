import { defineConfig } from 'vitest/config';

// Vitest copre solo la logica di dominio in TypeScript puro (src/domain).
// I componenti React Native si testeranno a parte quando servirà.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
