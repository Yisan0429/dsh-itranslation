/**
 * Host-side plugin settings route tests (D69): the `/_dsh/itranslation/settings`
 * route serves the namespace through `ctx.settings` server-side and guards
 * POSTs by same-origin. Covers every handler branch for the 100% gate.
 */
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  SETTINGS_ROUTE, applyWebSettings, handleSettings, sameOrigin, settingsRoute,
} from '../src/web-settings'
import { ITRANSLATION_SETTINGS_NAMESPACE } from '../src/settings'

interface FakeSettings {
  writable: boolean
  documentPath: string | undefined
  describe: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

function ctxWith(settings: FakeSettings | undefined): Context {
  return {
    get: (name: string) => (name === 'settings' ? settings : undefined),
  } as unknown as Context
}

function descriptor(overrides: Partial<{ value: unknown; revision: number }> = {}) {
  return {
    ns: ITRANSLATION_SETTINGS_NAMESPACE,
    schema: {},
    value: overrides.value ?? { preReadPrompt: 'p1' },
    applies: 'live',
    secrets: [],
    revision: overrides.revision ?? 3,
  }
}

function okSettings(): FakeSettings {
  return {
    writable: true,
    documentPath: '/home/yisan/.dsh/settings.yaml',
    describe: vi.fn(() => [descriptor()]),
    update: vi.fn(async () => {}),
  }
}

/** Parse a fake response body as the route envelope. */
function bodyOf(res: { body: string }): { ok?: boolean; code?: string; message?: string } {
  return JSON.parse(res.body) as { ok?: boolean; code?: string; message?: string }
}

function fakeReq(
  method: string,
  headers: Record<string, string | undefined> = {},
  body?: string,
  emitError?: unknown,
): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage & {
    method: string
    headers: Record<string, string | undefined>
    destroy(error?: Error): IncomingMessage
  }
  req.method = method
  req.headers = headers
  req.destroy = () => req
  queueMicrotask(() => {
    if (emitError !== undefined) {
      req.emit('error', emitError)
      return
    }
    if (body !== undefined) req.emit('data', Buffer.from(body))
    req.emit('end')
  })
  return req
}

function fakeRes(): { res: ServerResponse; status: number; body: string; headers: Record<string, string> } {
  // `out` is returned by reference: writeHead/end mutations must be visible
  // on the returned object (a spread copy would freeze status at 0).
  const out = { status: 0, body: '', headers: {} as Record<string, string>, res: undefined as unknown as ServerResponse }
  out.res = {
    writeHead(status: number, headers?: Record<string, string>) {
      out.status = status
      if (headers !== undefined) Object.assign(out.headers, headers)
    },
    setHeader(name: string, value: string) {
      out.headers[name] = value
    },
    end(body?: string) {
      if (body !== undefined) out.body += body
    },
  } as unknown as ServerResponse
  return out
}

async function call(method: string, settings: FakeSettings | undefined, headers: Record<string, string | undefined> = {}, body?: string) {
  const req = fakeReq(method, headers, body)
  const res = fakeRes()
  await handleSettings(ctxWith(settings), req, res.res)
  return res
}

const SAME_ORIGIN = { 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' }

describe('sameOrigin', () => {
  it('rejects cross-site requests', () => {
    expect(sameOrigin(fakeReq('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })

  it('rejects a request with no origin evidence at all', () => {
    expect(sameOrigin(fakeReq('POST', {}))).toBe(false)
  })

  it('accepts missing-origin requests with a same-origin fetch hint', () => {
    expect(sameOrigin(fakeReq('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(true)
  })

  it('accepts missing-origin requests with same-site or none fetch hints', () => {
    expect(sameOrigin(fakeReq('POST', { 'sec-fetch-site': 'same-site' }))).toBe(true)
    expect(sameOrigin(fakeReq('POST', { 'sec-fetch-site': 'none' }))).toBe(true)
  })

  it('accepts an https origin matching the Host header', () => {
    expect(sameOrigin(fakeReq('POST', { origin: 'https://dsh.local:8443', host: 'dsh.local:8443' }))).toBe(true)
  })

  it('accepts an origin matching the Host header', () => {
    expect(sameOrigin(fakeReq('POST', { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' }))).toBe(true)
  })

  it('rejects a mismatched origin', () => {
    expect(sameOrigin(fakeReq('POST', { origin: 'http://evil.example', host: '127.0.0.1:3080' }))).toBe(false)
  })

  it('rejects an origin with no Host header', () => {
    expect(sameOrigin(fakeReq('POST', { origin: 'http://127.0.0.1:3080' }))).toBe(false)
  })

  it('rejects an unparsable origin', () => {
    expect(sameOrigin(fakeReq('POST', { origin: 'not a url', host: '127.0.0.1:3080' }))).toBe(false)
  })
})

describe('settingsRoute', () => {
  it('declares the exact route path', () => {
    expect(settingsRoute(ctxWith(okSettings())).path).toBe(SETTINGS_ROUTE)
    expect(settingsRoute(ctxWith(okSettings())).kind).toBe('exact')
  })

  it('mounts the route through the webServer service', () => {
    const registered: unknown[] = []
    const webCtx = {
      effect: (setup: () => unknown) => { setup() },
      webServer: { register: (route: unknown) => { registered.push(route) } },
    }
    const ctx = {
      inject: (deps: string[], setup: (web: typeof webCtx) => void) => {
        if (deps.includes('webServer')) setup(webCtx)
      },
    } as unknown as Context
    applyWebSettings(ctx)
    expect(registered).toHaveLength(1)
    expect((registered[0] as { path: string }).path).toBe(SETTINGS_ROUTE)
  })

  it('serves the route handler end to end', async () => {
    const route = settingsRoute(ctxWith(okSettings()))
    const res = fakeRes()
    await route.handler(fakeReq('GET'), res.res)
    expect(res.status).toBe(200)
    expect(bodyOf(res).ok).toBe(true)
  })
})

describe('handleSettings GET', () => {
  it('serves the namespace snapshot', async () => {
    const settings = okSettings()
    const res = await call('GET', settings)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      value: {
        value: { preReadPrompt: 'p1' },
        writable: true,
        hasDocument: true,
        revision: 3,
      },
    })
  })

  it('answers 503 when no settings provider is mounted', async () => {
    const res = await call('GET', undefined)
    expect(res.status).toBe(503)
    expect(bodyOf(res).code).toBe('settings-unavailable')
  })

  it('answers 503 when the namespace is not registered', async () => {
    const settings = okSettings()
    settings.describe.mockReturnValue([])
    const res = await call('GET', settings)
    expect(res.status).toBe(503)
    expect(bodyOf(res).code).toBe('settings-unavailable')
  })
})

describe('handleSettings POST', () => {
  it('saves a patch with an expected revision', async () => {
    const settings = okSettings()
    const res = await call('POST', settings, SAME_ORIGIN, JSON.stringify({
      action: 'save',
      patch: { preReadPrompt: 'p9' },
      expectedRevision: 3,
    }))
    expect(res.status).toBe(200)
    expect(settings.update).toHaveBeenCalledWith(
      ITRANSLATION_SETTINGS_NAMESPACE,
      { preReadPrompt: 'p9' },
      3,
    )
    expect(bodyOf(res).ok).toBe(true)
  })

  it('saves a patch without a revision', async () => {
    const settings = okSettings()
    await call('POST', settings, SAME_ORIGIN, JSON.stringify({ action: 'save', patch: {} }))
    expect(settings.update).toHaveBeenCalledWith(ITRANSLATION_SETTINGS_NAMESPACE, {}, undefined)
  })

  it('answers 405 for other methods', async () => {
    const res = await call('PUT', okSettings())
    expect(res.status).toBe(405)
    expect(res.headers.Allow).toBe('GET, POST')
  })

  it('answers 403 for cross-origin posts', async () => {
    const res = await call('POST', okSettings(), { 'sec-fetch-site': 'cross-site' }, '{}')
    expect(res.status).toBe(403)
    expect(bodyOf(res).code).toBe('origin-rejected')
  })

  it('answers 400 for an unparsable body', async () => {
    const res = await call('POST', okSettings(), SAME_ORIGIN, 'not json')
    expect(res.status).toBe(400)
    expect(bodyOf(res).code).toBe('invalid-request')
  })

  it('answers 400 when the request stream errors with a non-Error value', async () => {
    const req = fakeReq('POST', SAME_ORIGIN, undefined, 'stream failed')
    const res = fakeRes()
    await handleSettings(ctxWith(okSettings()), req, res.res)
    expect(res.status).toBe(400)
    expect(bodyOf(res).code).toBe('invalid-request')
  })

  it('answers 413 for an oversized body', async () => {
    const res = await call('POST', okSettings(), SAME_ORIGIN, 'x'.repeat(70 * 1024))
    expect(res.status).toBe(413)
    expect(bodyOf(res).code).toBe('invalid-request')
  })

  it('answers 400 for a non-save action', async () => {
    const res = await call('POST', okSettings(), SAME_ORIGIN, JSON.stringify({ action: 'delete' }))
    expect(res.status).toBe(400)
    expect(bodyOf(res).code).toBe('invalid-request')
  })

  it('answers 400 for a non-object patch', async () => {
    const res = await call('POST', okSettings(), SAME_ORIGIN, JSON.stringify({ action: 'save', patch: 'nope' }))
    expect(res.status).toBe(400)
  })

  it('answers 400 for a non-numeric expectedRevision', async () => {
    const res = await call('POST', okSettings(), SAME_ORIGIN, JSON.stringify({ action: 'save', patch: {}, expectedRevision: 'x' }))
    expect(res.status).toBe(400)
  })

  it('answers 503 when the provider is missing on save', async () => {
    const res = await call('POST', undefined, SAME_ORIGIN, JSON.stringify({ action: 'save', patch: {} }))
    expect(res.status).toBe(503)
    expect(bodyOf(res).code).toBe('settings-unavailable')
  })

  it('answers 409 on a revision conflict', async () => {
    const settings = okSettings()
    settings.update.mockRejectedValue(new SettingsConflictError(settingsNamespace(ITRANSLATION_SETTINGS_NAMESPACE), 3, 4))
    const res = await call('POST', settings, SAME_ORIGIN, JSON.stringify({ action: 'save', patch: {} }))
    expect(res.status).toBe(409)
    expect(bodyOf(res).code).toBe('settings-conflict')
  })

  it('answers 400 when the write is rejected', async () => {
    const settings = okSettings()
    settings.update.mockRejectedValue(new Error('schema rejected'))
    const res = await call('POST', settings, SAME_ORIGIN, JSON.stringify({ action: 'save', patch: {} }))
    expect(res.status).toBe(400)
    expect(bodyOf(res).code).toBe('settings-rejected')
  })

  it('answers 503 when the namespace vanishes after a successful write', async () => {
    const settings = okSettings()
    settings.update.mockImplementation(() => { settings.describe.mockReturnValue([]) })
    const res = await call('POST', settings, SAME_ORIGIN, JSON.stringify({ action: 'save', patch: {} }))
    expect(res.status).toBe(503)
    expect(bodyOf(res).code).toBe('settings-unavailable')
  })
})
