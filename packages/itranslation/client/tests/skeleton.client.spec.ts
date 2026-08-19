// @vitest-environment jsdom
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it, vi } from 'vitest'
import { apply as applyHost, clientNodeEntry } from '../src/index'
import { apply, inject, name } from '../src/client/index'
import { ITRANSLATION_TOOL_NAMES } from '../src/client/model'

interface Registration {
  options: {
    name: string
    key?: string
    id?: string
    order?: number
    label?: string | (() => string)
    inject?: () => unknown
  }
  component: unknown
}

function createContext() {
  const setups = new Map<string, Array<() => unknown>>()
  const registrations: Registration[] = []
  const slots = {
    inject(slotName: string, setup: () => unknown): void {
      const list = setups.get(slotName) ?? []
      list.push(setup)
      setups.set(slotName, list)
    },
    register(options: Registration['options'], component: unknown): () => void {
      registrations.push({ options, component })
      return vi.fn()
    },
  }
  const en = {
    nav: 'Itranslation', intro: 'intro', preRead: 'Pre-reading prompt',
    translate: 'Translation prompt', audit: 'Audit prompt', revise: 'Revision prompt',
    save: 'Save prompts', saving: 'Saving…', loading: 'Loading Itranslation settings…',
    failed: 'Failed to load:', missing: 'missing',
  }
  const t = vi.fn((key: keyof typeof en) => en[key])
  const locale = { register: vi.fn(), bind: vi.fn(() => t) }
  const api = { settings: { describe: vi.fn(), update: vi.fn() } }
  const get = vi.fn((_service: string) => ({ api }))
  const on = vi.fn(() => vi.fn())
  const ctx = {
    slots, locale, get, on,
    effect: (setup: () => unknown) => { setup(); return vi.fn() },
  } as unknown as ClientContext
  return { ctx, setups, registrations, api, get, locale }
}

function runSetups(setups: Map<string, Array<() => unknown>>, slotName: string): void {
  for (const setup of setups.get(slotName) ?? []) {
    const result = setup()
    if (result !== null && typeof result === 'object' && Symbol.iterator in result) {
      for (const _dispose of result as Iterable<unknown>) {
        // driving the generator covers the registration loop in apply().
      }
    }
  }
}

describe('client package host entry', () => {
  it('exposes the node entry placeholder', () => {
    expect(clientNodeEntry).toBe('itranslation-client-node')
  })

  it('provides a no-op host apply so the Loader accepts it as an entry', () => {
    expect(() =>{  applyHost() }).not.toThrow()
  })
})

describe('client browser plugin', () => {
  it('declares its identity and services', () => {
    expect(name).toBe('itranslation-client')
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers one toolview per deterministic tool', () => {
    const { ctx, setups, registrations } = createContext()
    apply(ctx)
    runSetups(setups, 'tool.call.toolview')
    const toolRows = registrations.filter(registration => registration.options.name === 'tool.call.toolview')
    expect(toolRows.map(row => row.options.key)).toEqual([...ITRANSLATION_TOOL_NAMES])
  })

  it('registers the settings section with a working inject face', () => {
    const { ctx, setups, registrations, get, locale } = createContext()
    apply(ctx)
    runSetups(setups, 'settings.section')
    const section = registrations.find(registration => registration.options.name === 'settings.section')
    expect(section?.options).toMatchObject({
      id: 'itranslation',
      order: 30,
    })
    const label = section?.options.label
    expect(typeof label).toBe('function')
    expect((label as () => string)()).toBe('Itranslation')
    const injectFace = section?.options.inject?.() as Record<string, unknown> | undefined
    expect(injectFace).toBeDefined()
    expect(typeof injectFace?.controller).toBe('object')
    expect(typeof injectFace?.useSnapshot).toBe('function')
    expect(typeof injectFace?.t).toBe('function')
    expect(get).toHaveBeenCalledWith('connection')
    expect(locale.register).toHaveBeenCalled()
    expect(locale.bind).toHaveBeenCalled()
  })
})
