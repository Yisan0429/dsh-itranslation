import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/*/tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // Coverage measures OUR runtime source. Types-only files carry no
      // executable code and are excluded.
      include: ['packages/*/*/src/**/*.ts'],
      exclude: [
        'packages/*/*/src/types.ts',
      ],
      // 100% per file or it fails (DEVELOPMENT.md 2.2): a well-covered big
      // file cannot subsidize a bare one.
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
