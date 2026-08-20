/**
 * Design-language contract guards (D66): the client UI must render through
 * the shared product visual language. These read the source on disk and pin
 * the three invariants mechanically — CSS Modules resolve every color to
 * `--dsw-alias-*` tokens (no literals, no bare `--border`/`--surface`/
 * `--text-*` names, no theme selectors), the browser bundle is produced by
 * the shared `clientBundle` preset (no hand-written tsdown pipeline), and
 * view classNames come from CSS Module maps (no handwritten class strings).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientSrc = fileURLToPath(new URL('../src/client/', import.meta.url))

/** Local custom properties a feature css file may declare for component layout. */
const LOCAL_PROP = /^--(?:dsh|dsl)-[a-z0-9-]+$/

const MODULE_CSS_FILES = [
  'tool-view.module.css',
  'settings-section.module.css',
]

function moduleCss(name: string): string {
  return readFileSync(`${clientSrc}${name}`, 'utf8')
}

/** Every `var(--X)` reference in a stylesheet. */
function varRefs(source: string): string[] {
  return [...source.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(match => match[1]!)
}

describe('client module.css resolves to --dsw-alias-* theme tokens', () => {
  for (const file of MODULE_CSS_FILES) {
    const source = moduleCss(file)

    it(`${file} uses no bare --border/--surface/--text-* names`, () => {
      expect(source).not.toMatch(/var\(--(?:border|surface|text)[^a-z-]/)
    })

    it(`${file} uses no color literals`, () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    })

    it(`${file} references only --dsw-alias-* colors, --dsw-font-* typography, or locally declared properties`, () => {
      const declared = new Set(
        [...source.matchAll(/(--(?:dsh|dsl)-[a-z0-9-]+)\s*:/g)].map(match => match[1]!),
      )
      for (const ref of varRefs(source)) {
        const ok = ref.startsWith('--dsw-alias-')
          || ref.startsWith('--dsw-font-')
          || (LOCAL_PROP.test(ref) && declared.has(ref))
        expect(ok, `unresolved variable ${ref}`).toBe(true)
      }
    })

    it(`${file} leaves theme ownership to the theme package`, () => {
      expect(source).not.toMatch(/prefers-color-scheme|\[data-theme\]|\.dark|\.light\b/)
    })
  }
})

describe('client bundle is produced by the shared clientBundle preset', () => {
  const config = readFileSync(fileURLToPath(new URL('../tsdown.config.ts', import.meta.url)), 'utf8')

  it('imports and invokes the shared preset', () => {
    expect(config).toContain('clientBundle')
    expect(config).toContain('deepseek-harness/packages/client/tsdown.client.ts')
  })

  it('does not hand-write a browser pipeline', () => {
    expect(config).not.toContain('browserBundle')
    expect(config).not.toContain('window.__ModuleLoader__')
    expect(config).not.toMatch(/entry:\s*\{\s*client/)
  })
})

describe('view classNames come from CSS Module maps', () => {
  for (const view of ['tool-view.ts', 'settings-section.ts']) {
    const source = readFileSync(`${clientSrc}${view}`, 'utf8')

    it(`${view} uses no handwritten class strings`, () => {
      expect(source).not.toMatch(/className:\s*['"]itranslation-/)
      expect(source).not.toMatch(/className=['"]itranslation-/)
      expect(source).toContain('module.css')
    })
  }
})
