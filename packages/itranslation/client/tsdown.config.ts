import { defineConfig } from 'tsdown'

/** Browser platform modules resolved from the DSH web loader module table. */
const PLATFORM_EXTERNALS = ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-web-react'] as const

const nodeLibrary = {
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: false,
} as const

const browserBundle = {
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...PLATFORM_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
  },
  // The bundle body runs inside `factory(require)`; `module`/`exports` are
  // declared in the closure so the CJS emit targets them instead of globals.
  banner:
    `window.__ModuleLoader__.load({ ` +
    `id: "@deepseek-ai/dsh-itranslation-client", ` +
    `factory: (require) => { ` +
    `var module = { exports: {} }; ` +
    `var exports = module.exports;`,
  footer: 'return module.exports; } });',
} as const

/**
 * A package-level tsdown config REPLACES the root workspace layout, so both
 * halves are restated here: the Host pass emits the node library, the Client
 * pass emits the node library plus the web module-loader browser bundle.
 */
export default defineConfig(({ env }) => {
  const face = env?.DSH_BUILD_FACE
  if (face === undefined) return [nodeLibrary, browserBundle]
  return face === 'host' ? [nodeLibrary] : [nodeLibrary, browserBundle]
})
