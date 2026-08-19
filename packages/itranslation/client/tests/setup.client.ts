// Client bundle specs import runtime modules that expect the web shell's
// module-loader sink. jsdom provides `window`; provide the sink shape.
const g = globalThis as typeof globalThis & {
  __ModuleLoader__?: { load(_entry: unknown): void }
  __DSH_BOOT__?: { rev: string; entries: unknown[] }
}
if (g.__ModuleLoader__ === undefined) {
  g.__ModuleLoader__ = { load: () => {} }
}
if (g.__DSH_BOOT__ === undefined) {
  g.__DSH_BOOT__ = { rev: 'test', entries: [] }
}
