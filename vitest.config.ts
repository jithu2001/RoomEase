import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Business logic only — no DOM needed, so tests stay fast.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
