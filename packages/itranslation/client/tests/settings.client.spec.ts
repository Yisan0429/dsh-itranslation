// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createItranslationSettingsApi,
  DEFAULT_ITRANSLATION_SETTINGS,
  ITRANSLATION_SETTINGS_NAMESPACE,
  ItranslationSettingsController,
  messageOf,
  readSettingsValue,
  type ItranslationSettingsApi,
  type ItranslationSettingsState,
  type ItranslationSettingsView,
} from '../src/client/settings-store'
import { ItranslationSettingsSection } from '../src/client/settings-section'

const PROMPTS = {
  preReadPrompt: 'pre-read prompt',
  translatePrompt: 'translate prompt',
  auditPrompt: 'audit prompt',
  revisePrompt: 'revise prompt',
  targetLanguage: '简体中文',
  inputFile: '',
}

const SECTION_COPY = {
  nav: 'Itranslation',
  intro: 'Prompt templates used by the agent for each LLM step. Leave blank to use no extra prompt.',
  preRead: 'Pre-reading prompt',
  translate: 'Translation prompt',
  audit: 'Audit prompt',
  revise: 'Revision prompt',
  save: 'Save prompts',
  saving: 'Saving…',
  loading: 'Loading Itranslation settings…',
  failed: 'Failed to load:',
  missing: 'The itranslation settings backend is unavailable; saving is disabled.',
} as const

function viewOf(value: unknown, revision?: number): ItranslationSettingsView {
  return { value, writable: true, hasDocument: true, revision }
}

/** A fake plugin-route api capturing load/save calls. */
function makeApi(overrides: Partial<ItranslationSettingsApi> = {}) {
  const defaults: ItranslationSettingsApi = {
    load: vi.fn(async () => ({ ok: true, view: viewOf(PROMPTS, 3) }) as const),
    save: vi.fn(async () => ({ ok: true }) as const),
  }
  const api: ItranslationSettingsApi = { ...defaults, ...overrides }
  return { api, load: api.load, save: api.save }
}

/** Build the inject face the section consumes, around a ready controller. */
function makeProps(state: Omit<ItranslationSettingsState, 'revision'> & { revision?: number }, api?: ItranslationSettingsApi) {
  const controller = new ItranslationSettingsController(api ?? makeApi().api)
  controller.store.set({ ...state, revision: state.revision })
  const useSnapshot = (selector: (snapshot: ItranslationSettingsState) => unknown) => selector(controller.store.getSnapshot())
  const t = vi.fn((key: keyof typeof SECTION_COPY) => SECTION_COPY[key])
  return { controller, useSnapshot, t }
}

/** A minimal fetch Response double. */
function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body }
}

describe('settings helpers', () => {
  it('pins the namespace contract', () => {
    expect(ITRANSLATION_SETTINGS_NAMESPACE).toBe('itranslation')
  })

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
})

describe('createItranslationSettingsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads a snapshot from the plugin route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true, 200, {
      ok: true,
      value: { value: PROMPTS, writable: true, hasDocument: false, revision: 5 },
    })))
    const result = await createItranslationSettingsApi().load()
    expect(result).toEqual({
      ok: true,
      view: { value: PROMPTS, writable: true, hasDocument: false, revision: 5 },
    })
  })

  it('maps a missing revision to undefined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true, 200, {
      ok: true,
      value: { value: {}, writable: true, hasDocument: false },
    })))
    const result = await createItranslationSettingsApi().load()
    expect(result.ok && result.view.revision).toBeUndefined()
  })

  it('maps a read-only provider snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true, 200, {
      ok: true,
      value: { value: {}, writable: false, hasDocument: true, revision: 1 },
    })))
    const result = await createItranslationSettingsApi().load()
    expect(result.ok && result.view.writable).toBe(false)
  })

  it('treats an ok-status body with ok:false as a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true, 200, {
      ok: false, code: 'settings-rejected', message: 'denied',
    })))
    const result = await createItranslationSettingsApi().load()
    expect(result).toEqual({ ok: false, error: 'denied', code: 'settings-rejected' })
  })

  it('surfaces a backend-unavailable refusal with its code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(false, 503, {
      ok: false, code: 'settings-unavailable', message: 'no provider',
    })))
    const result = await createItranslationSettingsApi().load()
    expect(result).toEqual({ ok: false, error: 'no provider', code: 'settings-unavailable' })
  })

  it('falls back to the HTTP status when a refusal carries no message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(false, 500, { ok: false })))
    const result = await createItranslationSettingsApi().load()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('HTTP 500')
  })

  it('treats an ok body without a value as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true, 200, { ok: true })))
    const result = await createItranslationSettingsApi().load()
    expect(result.ok).toBe(false)
  })

  it('records transport failures on load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    const result = await createItranslationSettingsApi().load()
    expect(result).toEqual({ ok: false, error: 'network' })
  })

  it('posts a save action with an expected revision', async () => {
    type FetchInit = { method?: string; headers?: Record<string, string>; body?: string }
    const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) => jsonResponse(true, 200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await createItranslationSettingsApi().save(PROMPTS, 7)
    expect(result).toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({ action: 'save', patch: PROMPTS, expectedRevision: 7 })
  })

  it('posts a save action without a revision when none was read', async () => {
    type FetchInit = { method?: string; headers?: Record<string, string>; body?: string }
    const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) => jsonResponse(true, 200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await createItranslationSettingsApi().save(PROMPTS, undefined)
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ action: 'save', patch: PROMPTS })
  })

  it('treats an ok-status save body with ok:false as a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true, 200, {
      ok: false, code: 'settings-rejected', message: 'denied',
    })))
    const result = await createItranslationSettingsApi().save(PROMPTS, 3)
    expect(result).toEqual({ ok: false, error: 'denied', code: 'settings-rejected' })
  })

  it('falls back to the HTTP status when a save refusal carries no message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(true, 500, { ok: false })))
    const result = await createItranslationSettingsApi().save(PROMPTS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('HTTP 500')
  })

  it('surfaces a save conflict refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(false, 409, {
      ok: false, code: 'settings-conflict', message: 'conflict',
    })))
    const result = await createItranslationSettingsApi().save(PROMPTS, 3)
    expect(result).toEqual({ ok: false, error: 'conflict', code: 'settings-conflict' })
  })

  it('records transport failures on save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const result = await createItranslationSettingsApi().save(PROMPTS)
    expect(result).toEqual({ ok: false, error: 'offline' })
  })
})

describe('ItranslationSettingsController', () => {
  it('skips a load while one is already in flight', async () => {
    const { api, load } = makeApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...controller.store.getSnapshot(), status: 'loading' })
    await controller.load()
    expect(load).not.toHaveBeenCalled()
  })

  it('loads a present namespace', async () => {
    const { api } = makeApi()
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', writable: true, missing: false, revision: 3,
      value: PROMPTS,
    })
  })

  it('loads the missing backend as read-only defaults', async () => {
    const { api } = makeApi({ load: vi.fn(async () => ({ ok: false, code: 'settings-unavailable', error: 'no provider' }) as const) })
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', writable: false, missing: true, value: DEFAULT_ITRANSLATION_SETTINGS,
    })
  })

  it('records business load failures', async () => {
    const { api } = makeApi({ load: vi.fn(async () => ({ ok: false, error: 'settings absent' }) as const) })
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'settings absent', writable: false })
  })

  it('records transport load failures', async () => {
    const { api } = makeApi({ load: vi.fn(async () => { throw new Error('network') }) })
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'network', writable: false })
  })

  it('refuses to save when not ready, read-only, or missing', async () => {
    const { api, save } = makeApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...controller.store.getSnapshot(), status: 'idle' })
    await controller.save()
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready', writable: false })
    await controller.save()
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready', writable: true, missing: true })
    await controller.save()
    expect(save).not.toHaveBeenCalled()
  })

  it('records business save failures', async () => {
    const { api } = makeApi({ save: vi.fn(async () => ({ ok: false, error: 'conflict' }) as const) })
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    await controller.save()
    expect(controller.store.getSnapshot().status).toBe('ready')
    expect(controller.store.getSnapshot().error).toBe('conflict')
  })

  it('records transport save failures', async () => {
    const { api } = makeApi({ save: vi.fn(async () => { throw new Error('offline') }) })
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    await controller.save()
    expect(controller.store.getSnapshot().status).toBe('ready')
    expect(controller.store.getSnapshot().error).toBe('offline')
  })

  it('saves and reloads on success', async () => {
    const { api, save } = makeApi({ save: vi.fn(async () => ({ ok: true }) as const) })
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    await controller.save()
    expect(save).toHaveBeenCalledWith(PROMPTS, 3)
    expect(controller.store.getSnapshot().value).toEqual(PROMPTS)
  })

  it('saves without an expected revision when none was read', async () => {
    const { api, save } = makeApi({ save: vi.fn(async () => ({ ok: false, error: 'no revision' }) as const) })
    const controller = new ItranslationSettingsController(api)
    controller.store.set({
      ...controller.store.getSnapshot(),
      status: 'ready', writable: true, missing: false, revision: undefined,
    })
    await controller.save()
    expect(save).toHaveBeenCalledWith(DEFAULT_ITRANSLATION_SETTINGS, undefined)
    expect(controller.store.getSnapshot().error).toBe('no revision')
  })

  it('updates draft values', () => {
    const { api } = makeApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready', writable: true })
    controller.setPreReadPrompt('p1')
    expect(controller.store.getSnapshot().value.preReadPrompt).toBe('p1')
    controller.setTranslatePrompt('p2')
    expect(controller.store.getSnapshot().value.translatePrompt).toBe('p2')
    controller.setAuditPrompt('p3')
    expect(controller.store.getSnapshot().value.auditPrompt).toBe('p3')
    controller.setRevisePrompt('p4')
    expect(controller.store.getSnapshot().value.revisePrompt).toBe('p4')
  })
})

describe('ItranslationSettingsSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders null before injection', () => {
    expect(ItranslationSettingsSection({})).toBeNull()
  })

  it('renders the form for idle state and triggers load', () => {
    const { controller, useSnapshot, t } = makeProps({
      status: 'idle', error: null, writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS,
    })
    const load = vi.spyOn(controller, 'load').mockResolvedValue(undefined)
    const html = renderToStaticMarkup(createElement(ItranslationSettingsSection, { controller, useSnapshot, t } as never))
    expect(load).toHaveBeenCalledOnce()
    expect(html).toContain('Prompt templates used by the agent')
  })

  it('renders the loading state', () => {
    const { controller, useSnapshot, t } = makeProps({ status: 'loading', error: null, writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    const html = renderToStaticMarkup(createElement(ItranslationSettingsSection, { controller, useSnapshot, t } as never))
    expect(html).toContain('Loading Itranslation settings')
  })

  it('renders the load-error state', () => {
    const { controller, useSnapshot, t } = makeProps({ status: 'error', error: 'boom', writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    const html = renderToStaticMarkup(createElement(ItranslationSettingsSection, { controller, useSnapshot, t } as never))
    expect(html).toContain('Failed to load: boom')
  })

  it('renders a ready editable form', () => {
    const { controller, useSnapshot, t } = makeProps({
      status: 'ready', error: null, writable: true, missing: false,
      value: PROMPTS, revision: 3,
    })
    const html = renderToStaticMarkup(createElement(ItranslationSettingsSection, { controller, useSnapshot, t } as never))
    expect(html).toContain('Pre-reading prompt')
    expect(html).toContain('Translation prompt')
    expect(html).toContain('Audit prompt')
    expect(html).toContain('Revision prompt')
    expect(html).toContain('Save prompts')
    expect(html).not.toContain('The itranslation settings backend is unavailable')
  })

  it('renders the missing-backend notice', () => {
    const { controller, useSnapshot, t } = makeProps({
      status: 'ready', error: null, writable: false, missing: true, value: DEFAULT_ITRANSLATION_SETTINGS,
    })
    const html = renderToStaticMarkup(createElement(ItranslationSettingsSection, { controller, useSnapshot, t } as never))
    expect(html).toContain('The itranslation settings backend is unavailable')
  })

  it('renders saving and save-error states', () => {
    const saving = makeProps({ status: 'saving', error: null, writable: true, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    const savingHtml = renderToStaticMarkup(createElement(ItranslationSettingsSection, saving as never))
    expect(savingHtml).toContain('Saving…')
    const error = makeProps({ status: 'ready', error: 'save failed', writable: true, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    const errorHtml = renderToStaticMarkup(createElement(ItranslationSettingsSection, error as never))
    expect(errorHtml).toContain('save failed')
  })

  it('routes textarea edits through the per-field setters and saves through the controller', () => {
    const { controller, useSnapshot, t } = makeProps({
      status: 'ready', error: null, writable: true, missing: false,
      value: { ...DEFAULT_ITRANSLATION_SETTINGS }, revision: 3,
    })
    const save = vi.spyOn(controller, 'save').mockResolvedValue(undefined)
    render(createElement(ItranslationSettingsSection, { controller, useSnapshot, t } as never))
    const fields = ['preReadPrompt', 'translatePrompt', 'auditPrompt', 'revisePrompt'] as const
    const labels = ['Pre-reading prompt', 'Translation prompt', 'Audit prompt', 'Revision prompt'] as const
    fields.forEach((field, index) => {
      const input = screen.getByLabelText(labels[index]!) as HTMLTextAreaElement
      fireEvent.change(input, { target: { value: field } })
    })
    fireEvent.click(screen.getByText('Save prompts'))
    expect(controller.store.getSnapshot().value).toEqual({
      preReadPrompt: 'preReadPrompt',
      translatePrompt: 'translatePrompt',
      auditPrompt: 'auditPrompt',
      revisePrompt: 'revisePrompt',
      targetLanguage: '简体中文',
      inputFile: '',
    })
    expect(save).toHaveBeenCalled()
  })
})
