import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it, vi } from 'vitest'
import { clientNodeEntry } from '../src/index'
import { apply, inject, name } from '../src/client/index'
import { ITRANSLATION_TOOL_NAMES } from '../src/client/model'

interface Registration {
  options: {
    name: string
    key?: string
    id?: string
    order?: number
    label?: string
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
  const api = { settings: { describe: vi.fn(), update: vi.fn() } }
  const get = vi.fn((_service: string) => ({ api }))
  const ctx = { slots, get } as unknown as ClientContext
  return { ctx, setups, registrations, api, get }
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
})

describe('client browser plugin', () => {
  it('declares its identity and services', () => {
    expect(name).toBe('itranslation-client')
    expect(inject).toEqual(['slots', 'connection'])
  })

  it('registers one toolview per deterministic tool', () => {
    const { ctx, setups, registrations } = createContext()
    apply(ctx)
    runSetups(setups, 'tool.call.toolview')
    const toolRows = registrations.filter(registration => registration.options.name === 'tool.call.toolview')
    expect(toolRows.map(row => row.options.key)).toEqual([...ITRANSLATION_TOOL_NAMES])
  })

  it('refuses to apply without a connection service', () => {
    const { ctx, get } = createContext()
    get.mockReturnValue(undefined as never)
    expect(() => { apply(ctx) }).toThrow('itranslation-client: connection.settings service is unavailable')
  })

  it('refuses to apply with a non-settings connection api', () => {
    const { ctx, get } = createContext()
    get.mockReturnValue({ api: null } as never)
    expect(() => { apply(ctx) }).toThrow('itranslation-client: connection.settings service is unavailable')
  })

  it('registers the settings section with a working inject face', () => {
    const { ctx, setups, registrations, api, get } = createContext()
    apply(ctx)
    runSetups(setups, 'settings.section')
    const section = registrations.find(registration => registration.options.name === 'settings.section')
    expect(section?.options).toMatchObject({
      id: 'itranslation',
      order: 30,
      label: '整本书翻译',
    })
    const injectFace = section?.options.inject?.() as Record<string, unknown> | undefined
    expect(injectFace).toBeDefined()
    expect(typeof injectFace?.load).toBe('function')
    expect(typeof injectFace?.save).toBe('function')
    expect(typeof injectFace?.setGenre).toBe('function')
    expect(typeof injectFace?.setTerminologyMode).toBe('function')
    expect(typeof injectFace?.useSnapshot).toBe('function')
    expect(get).toHaveBeenCalledWith('connection')
    expect(api.settings.describe).toBeDefined()
  })
})
