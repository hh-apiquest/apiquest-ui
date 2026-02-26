import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'tests/setup.ts'
      ]
    },
    setupFiles: ['./tests/setup.ts'],
    include: ['packages/**/tests/**/*.test.ts', 'tests/**/*.test.ts']
  }
});
