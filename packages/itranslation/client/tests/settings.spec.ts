import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ITRANSLATION_SETTINGS,
  ITRANSLATION_SETTINGS_NAMESPACE,
  isSettingsApi,
  ItranslationSettingsController,
  messageOf,
  readSettingsValue,
  type ItranslationSettingsState,
  type SettingsApi,
} from '../src/client/settings-store'
import { ItranslationSettingsSection } from '../src/client/settings-section'

const PROMPTS = {
  preReadPrompt: 'pre-read prompt',
  translatePrompt: 'translate prompt',
  auditPrompt: 'audit prompt',
  revisePrompt: 'revise prompt',
}

function createApi() {
  const describe = vi.fn()
  const update = vi.fn()
  const api = { settings: { describe, update } } as unknown as SettingsApi
  return { api, describe, update }
}

function namespace(value: unknown, revision = 3) {
  return { ns: ITRANSLATION_SETTINGS_NAMESPACE, schema: {}, value, secrets: [], applies: 'live', revision }
}

function describeOk(writable: boolean, namespaces: unknown[]) {
  return { result: { ok: true, value: { writable, hasDocument: false, namespaces } } } as never
}

function describeError(message: string) {
  return { result: { ok: false, error: { code: 'internal', message, details: {} } } } as never
}

function updateOk() {
  return { result: { ok: true, value: namespace(PROMPTS) } } as never
}

function updateError(message: string) {
  return { result: { ok: false, error: { code: 'settings-rejected', message, details: { ns: ITRANSLATION_SETTINGS_NAMESPACE } } } } as never
}

describe('settings helpers', () => {
  it('reads values with field-by-field defaults', () => {
    expect(readSettingsValue(PROMPTS)).toEqual(PROMPTS)
    expect(readSettingsValue({ preReadPrompt: '', translatePrompt: '', auditPrompt: '', revisePrompt: '' })).toEqual(DEFAULT_ITRANSLATION_SETTINGS)
    expect(readSettingsValue(null)).toEqual(DEFAULT_ITRANSLATION_SETTINGS)
    expect(readSettingsValue({
      preReadPrompt: 7, translatePrompt: {}, auditPrompt: 1, revisePrompt: false,
    })).toEqual(DEFAULT_ITRANSLATION_SETTINGS)
  })

  it('formats Error and non-Error messages', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
    expect(messageOf('plain')).toBe('plain')
  })

  it('narrows settings API values', () => {
    expect(isSettingsApi(null)).toBe(false)
    expect(isSettingsApi('x')).toBe(false)
    expect(isSettingsApi({})).toBe(false)
    expect(isSettingsApi({ settings: null })).toBe(false)
    expect(isSettingsApi({ settings: {} })).toBe(false)
    expect(isSettingsApi({ settings: { describe: vi.fn(), update: vi.fn() } })).toBe(true)
  })
})

describe('ItranslationSettingsController', () => {
  it('skips a load while one is already in flight', async () => {
    const { api, describe } = createApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...controller.store.getSnapshot(), status: 'loading' })
    await controller.load()
    expect(describe).not.toHaveBeenCalled()
  })

  it('loads a present namespace', async () => {
    const { api, describe } = createApi()
    describe.mockResolvedValue(describeOk(true, [namespace(PROMPTS, 9)]))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', writable: true, missing: false, revision: 9,
      value: PROMPTS,
    })
  })

  it('loads the missing namespace as read-only defaults', async () => {
    const { api, describe } = createApi()
    describe.mockResolvedValue(describeOk(true, []))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', writable: false, missing: true, value: DEFAULT_ITRANSLATION_SETTINGS,
    })
  })

  it('records business load failures', async () => {
    const { api, describe } = createApi()
    describe.mockResolvedValue(describeError('settings absent'))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'settings absent', writable: false })
  })

  it('records transport load failures', async () => {
    const { api, describe } = createApi()
    describe.mockRejectedValue(new Error('network'))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'network', writable: false })
  })

  it('refuses to save when not ready, read-only, or missing', async () => {
    const { api, update } = createApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...controller.store.getSnapshot(), status: 'idle' })
    controller.save()
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready', writable: false })
    controller.save()
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready', writable: true, missing: true })
    controller.save()
    await Promise.resolve()
    expect(update).not.toHaveBeenCalled()
  })

  it('records business save failures', async () => {
    const { api, describe, update } = createApi()
    describe.mockResolvedValue(describeOk(true, [namespace(PROMPTS, 3)]))
    update.mockResolvedValue(updateError('conflict'))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    controller.save()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('ready') })
    expect(controller.store.getSnapshot().error).toBe('conflict')
  })

  it('records transport save failures', async () => {
    const { api, describe, update } = createApi()
    describe.mockResolvedValue(describeOk(true, [namespace(PROMPTS, 3)]))
    update.mockRejectedValue(new Error('offline'))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    controller.save()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('ready') })
    expect(controller.store.getSnapshot().error).toBe('offline')
  })

  it('saves and reloads on success', async () => {
    const { api, describe, update } = createApi()
    describe.mockResolvedValue(describeOk(true, [namespace(PROMPTS, 3)]))
    update.mockResolvedValue(updateOk())
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    controller.save()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('ready') })
    expect(update).toHaveBeenCalledWith({
      ns: ITRANSLATION_SETTINGS_NAMESPACE,
      patch: PROMPTS,
      expectedRevision: 3,
    })
    expect(controller.store.getSnapshot().value).toEqual(PROMPTS)
  })

  it('saves without an expected revision when none was read', async () => {
    const { api, update } = createApi()
    update.mockResolvedValue(updateError('no revision'))
    const controller = new ItranslationSettingsController(api)
    controller.store.set({
      ...controller.store.getSnapshot(),
      status: 'ready', writable: true, missing: false, revision: undefined,
    })
    controller.save()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('ready') })
    expect(update).toHaveBeenCalledWith({
      ns: ITRANSLATION_SETTINGS_NAMESPACE,
      patch: DEFAULT_ITRANSLATION_SETTINGS,
    })
    expect(controller.store.getSnapshot().error).toBe('no revision')
  })

  it('updates draft values', () => {
    const { api } = createApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready', writable: true })
    controller.setPreReadPrompt({ target: { value: 'p1' } } as never)
    expect(controller.store.getSnapshot().value.preReadPrompt).toBe('p1')
    controller.setTranslatePrompt({ target: { value: 'p2' } } as never)
    expect(controller.store.getSnapshot().value.translatePrompt).toBe('p2')
    controller.setAuditPrompt({ target: { value: 'p3' } } as never)
    expect(controller.store.getSnapshot().value.auditPrompt).toBe('p3')
    controller.setRevisePrompt({ target: { value: 'p4' } } as never)
    expect(controller.store.getSnapshot().value.revisePrompt).toBe('p4')
  })
})

describe('ItranslationSettingsSection', () => {
  function renderWith(state: Omit<ItranslationSettingsState, 'revision'> & { revision?: number }) {
    const { api } = createApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...state, revision: state.revision })
    const load = vi.fn(async () => {})
    const useSnapshot = (selector: (snapshot: ItranslationSettingsState) => unknown) => selector(controller.store.getSnapshot())
    const props = {
      useSnapshot,
      load,
      setPreReadPrompt: vi.fn(),
      setTranslatePrompt: vi.fn(),
      setAuditPrompt: vi.fn(),
      setRevisePrompt: vi.fn(),
      save: vi.fn(),
      close: () => {},
    }
    const html = renderToStaticMarkup(createElement(ItranslationSettingsSection, props as never))
    return { html, load }
  }

  it('renders null before injection', () => {
    expect(ItranslationSettingsSection({} as never)).toBeNull()
  })

  it('renders the form for idle state and triggers load', () => {
    const { html, load } = renderWith({
      status: 'idle', error: null, writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS,
    })
    expect(load).toHaveBeenCalledOnce()
    expect(html).toContain('Prompt templates used by the agent')
  })

  it('renders the loading state', () => {
    const { html } = renderWith({ status: 'loading', error: null, writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(html).toContain('Loading Itranslation settings')
  })

  it('renders the load-error state', () => {
    const { html } = renderWith({ status: 'error', error: 'boom', writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(html).toContain('Failed to load: boom')
  })

  it('renders a ready editable form', () => {
    const { html } = renderWith({
      status: 'ready', error: null, writable: true, missing: false,
      value: PROMPTS, revision: 3,
    })
    expect(html).toContain('Pre-reading prompt')
    expect(html).toContain('Translation prompt')
    expect(html).toContain('Audit prompt')
    expect(html).toContain('Revision prompt')
    expect(html).toContain('Save prompts')
    expect(html).not.toContain('The itranslation settings namespace was not detected')
  })

  it('renders the missing-namespace notice', () => {
    const { html } = renderWith({
      status: 'ready', error: null, writable: false, missing: true, value: DEFAULT_ITRANSLATION_SETTINGS,
    })
    expect(html).toContain('The itranslation settings namespace was not detected')
  })

  it('renders saving and save-error states', () => {
    const saving = renderWith({ status: 'saving', error: null, writable: true, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(saving.html).toContain('Saving…')
    const error = renderWith({ status: 'ready', error: 'save failed', writable: true, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(error.html).toContain('save failed')
  })
})
