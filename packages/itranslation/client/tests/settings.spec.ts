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
  return { result: { ok: true, value: namespace({ genre: 'fiction', terminologyMode: 'auto' }) } } as never
}

function updateError(message: string) {
  return { result: { ok: false, error: { code: 'settings-rejected', message, details: { ns: ITRANSLATION_SETTINGS_NAMESPACE } } } } as never
}

describe('settings helpers', () => {
  it('reads values with field-by-field defaults', () => {
    expect(readSettingsValue({ genre: 'fiction', terminologyMode: 'manual' })).toEqual({
      genre: 'fiction', terminologyMode: 'manual',
    })
    expect(readSettingsValue({ genre: '', terminologyMode: 'auto' })).toEqual(DEFAULT_ITRANSLATION_SETTINGS)
    expect(readSettingsValue(null)).toEqual(DEFAULT_ITRANSLATION_SETTINGS)
    expect(readSettingsValue({ genre: 7, terminologyMode: 'x' })).toEqual(DEFAULT_ITRANSLATION_SETTINGS)
  })

  it('reads manual and non-manual terminology modes', () => {
    expect(readSettingsValue({ terminologyMode: 'manual' }).terminologyMode).toBe('manual')
    expect(readSettingsValue({ terminologyMode: 'auto' }).terminologyMode).toBe('auto')
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
    describe.mockResolvedValue(describeOk(true, [namespace({ genre: 'technical', terminologyMode: 'manual' }, 9)]))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', writable: true, missing: false, revision: 9,
      value: { genre: 'technical', terminologyMode: 'manual' },
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
    describe.mockResolvedValue(describeOk(true, [namespace({ genre: 'fiction', terminologyMode: 'auto' }, 3)]))
    update.mockResolvedValue(updateError('conflict'))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    controller.save()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('ready') })
    expect(controller.store.getSnapshot().error).toBe('conflict')
  })

  it('records transport save failures', async () => {
    const { api, describe, update } = createApi()
    describe.mockResolvedValue(describeOk(true, [namespace({ genre: 'fiction', terminologyMode: 'auto' }, 3)]))
    update.mockRejectedValue(new Error('offline'))
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    controller.save()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('ready') })
    expect(controller.store.getSnapshot().error).toBe('offline')
  })

  it('saves and reloads on success', async () => {
    const { api, describe, update } = createApi()
    describe.mockResolvedValue(describeOk(true, [namespace({ genre: 'fiction', terminologyMode: 'auto' }, 3)]))
    update.mockResolvedValue(updateOk())
    const controller = new ItranslationSettingsController(api)
    await controller.load()
    controller.save()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('ready') })
    expect(update).toHaveBeenCalledWith({
      ns: ITRANSLATION_SETTINGS_NAMESPACE,
      patch: { genre: 'fiction', terminologyMode: 'auto' },
      expectedRevision: 3,
    })
    expect(controller.store.getSnapshot().value).toEqual({ genre: 'fiction', terminologyMode: 'auto' })
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
      patch: { genre: 'auto', terminologyMode: 'auto' },
    })
    expect(controller.store.getSnapshot().error).toBe('no revision')
  })

  it('updates draft values', () => {
    const { api } = createApi()
    const controller = new ItranslationSettingsController(api)
    controller.store.set({ ...controller.store.getSnapshot(), status: 'ready', writable: true })
    controller.setGenre({ target: { value: 'children' } } as never)
    expect(controller.store.getSnapshot().value.genre).toBe('children')
    controller.setTerminologyMode({ target: { value: 'manual' } } as never)
    expect(controller.store.getSnapshot().value.terminologyMode).toBe('manual')
    controller.setTerminologyMode({ target: { value: 'auto' } } as never)
    expect(controller.store.getSnapshot().value.terminologyMode).toBe('auto')
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
      setGenre: vi.fn(),
      setTerminologyMode: vi.fn(),
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
    expect(html).toContain('整本书翻译的第 0 步问题卡')
  })

  it('renders the loading state', () => {
    const { html } = renderWith({ status: 'loading', error: null, writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(html).toContain('正在读取整本书翻译设置')
  })

  it('renders the load-error state', () => {
    const { html } = renderWith({ status: 'error', error: 'boom', writable: false, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(html).toContain('读取失败：boom')
  })

  it('renders a ready editable form', () => {
    const { html } = renderWith({
      status: 'ready', error: null, writable: true, missing: false,
      value: { genre: 'fiction', terminologyMode: 'manual' }, revision: 3,
    })
    expect(html).toContain('体裁默认')
    expect(html).toContain('术语确认模式')
    expect(html).toContain('保存默认值')
    expect(html).toContain('自动判断')
    expect(html).not.toContain('未检测到 itranslation 设置命名空间')
  })

  it('renders the missing-namespace notice', () => {
    const { html } = renderWith({
      status: 'ready', error: null, writable: false, missing: true, value: DEFAULT_ITRANSLATION_SETTINGS,
    })
    expect(html).toContain('未检测到 itranslation 设置命名空间')
  })

  it('renders saving and save-error states', () => {
    const saving = renderWith({ status: 'saving', error: null, writable: true, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(saving.html).toContain('保存中…')
    const error = renderWith({ status: 'ready', error: 'save failed', writable: true, missing: false, value: DEFAULT_ITRANSLATION_SETTINGS })
    expect(error.html).toContain('save failed')
  })
})
