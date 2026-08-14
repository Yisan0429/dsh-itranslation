import { defineConfig } from 'tsdown'

const nodeLibrary = {
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: false,
}

const browserBundle = {
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  clean: false,
}

/**
 * A package-level tsdown config REPLACES the root workspace layout, so both
 * halves are restated here: the Host pass emits the node library, the Client
 * pass emits the browser bundle. The DSH web module-loader handoff
 * (banner/footer) arrives with the real UI milestone.
 */
export default defineConfig(({ env }) => {
  const face = env?.DSH_BUILD_FACE
  if (face === undefined) return [nodeLibrary, browserBundle]
  return face === 'host' ? [nodeLibrary] : [browserBundle]
})
