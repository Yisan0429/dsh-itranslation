// @vitest-environment jsdom
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it, vi } from 'vitest'
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

interface SettingsControllerFace {
  store: { getSnapshot(): { status: string }; set(snapshot: { status: string }): void }
  load(): Promise<void>
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
  const handlers = new Map<string, (() => void)[]>()
  const on = vi.fn((event: string, handler: () => void) => {
    const list = handlers.get(event) ?? []
    list.push(handler)
    handlers.set(event, list)
    return vi.fn()
  })
  const ctx = {
    slots, locale, on,
    effect: (setup: () => unknown) => { setup(); return vi.fn() },
  } as unknown as ClientContext
  return { ctx, setups, registrations, locale, handlers }
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
    const { ctx, setups, registrations, locale } = createContext()
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
    expect(locale.register).toHaveBeenCalled()
    expect(locale.bind).toHaveBeenCalled()
  })

  it('reloads an already-loaded settings page on connection reset and skips an idle one', () => {
    const { ctx, setups, registrations, handlers } = createContext()
    apply(ctx)
    runSetups(setups, 'settings.section')
    const section = registrations.find(registration => registration.options.name === 'settings.section')
    const injectFace = section?.options.inject?.() as { controller?: SettingsControllerFace } | undefined
    const controller = injectFace!.controller!
    // Idle branch: the page never loaded, so a reset must not re-read.
    const idleLoad = vi.spyOn(controller, 'load').mockResolvedValue(undefined)
    for (const handler of handlers.get('connection/reset') ?? []) handler()
    expect(idleLoad).not.toHaveBeenCalled()
    // Ready branch: a loaded page refreshes from the Host.
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready' })
    for (const handler of handlers.get('connection/reset') ?? []) handler()
    expect(idleLoad).toHaveBeenCalled()
  })
})
