import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Same resolution harness tests use: built lib/ is a __ModuleLoader__
      // browser bundle, so tests must load the runtime from source.
      '@deepseek-ai/dsh-client-runtime/client': fileURLToPath(
        new URL('../deepseek-harness/packages/client/runtime/src/client/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/*/tests/**/*.spec.ts'],
    setupFiles: ['packages/itranslation/client/tests/setup.client.ts'],
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
