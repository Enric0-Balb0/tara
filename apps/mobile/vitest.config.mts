import { defineConfig } from 'vitest/config';

// Vitest copre solo la logica di dominio in TypeScript puro (src/domain).
// I componenti React Native si testeranno a parte quando servirà.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
