/**
 * Plugin-owned settings route for the itranslation settings page (D69). The
 * browser settings wire (`connection.api.settings.*`) only serves namespaces
 * on the harness apiproxy allowlist, so a third-party plugin's own namespace
 * can never reach the browser through it. The sanctioned channel is a
 * plugin-owned same-origin HTTP route (the `/_dsh/<plugin>/...` pattern, per
 * the vision-toolkit precedent): the Host half serves the namespace through
 * `ctx.settings` server-side (no allowlist), and the browser half fetches the
 * route directly.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { ITRANSLATION_SETTINGS_NAMESPACE } from './settings'

/** Same-origin settings endpoint consumed by the browser settings page. */
export const SETTINGS_ROUTE = '/_dsh/itranslation/settings'

/** Cap for POST bodies; larger requests answer 413. */
const MAX_BODY_BYTES = 64 * 1024

/** Human text for a rejection value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Accept a request only from the DSH Web application's own origin. */
export function sameOrigin(req: IncomingMessage): boolean {
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) {
    return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
  }
  const host = req.headers.host
  if (host === undefined) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { ok: false, code, message })
}

/** Collect the request body, rejecting oversized payloads with a RangeError. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new RangeError(`request body exceeds ${MAX_BODY_BYTES} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

/** The GET snapshot the browser page renders from. */
interface SettingsSnapshot {
  value: unknown
  writable: boolean
  hasDocument: boolean
  revision: number | undefined
}

function snapshotOf(ctx: Context): { ok: true; snapshot: SettingsSnapshot } | { ok: false; code: string; message: string } {
  const settings = ctx.get('settings')
  if (settings === undefined) {
    return { ok: false, code: 'settings-unavailable', message: 'The settings provider is not mounted' }
  }
  const descriptor = settings.describe().find(row => row.ns === ITRANSLATION_SETTINGS_NAMESPACE)
  if (descriptor === undefined) {
    return { ok: false, code: 'settings-unavailable', message: 'The itranslation settings namespace is not registered' }
  }
  return {
    ok: true,
    snapshot: {
      value: descriptor.value,
      writable: settings.writable,
      hasDocument: settings.documentPath !== undefined,
      revision: descriptor.revision,
    },
  }
}

type SaveResult = { ok: true; snapshot: SettingsSnapshot } | { ok: false; code: string; message: string; status: number }

async function handleSave(ctx: Context, parsed: unknown): Promise<SaveResult> {
  if (typeof parsed !== 'object' || parsed === null || !('action' in parsed) || parsed.action !== 'save') {
    return { ok: false, code: 'invalid-request', message: 'Expected an action of "save"', status: 400 }
  }
  const patch = (parsed as { patch?: unknown }).patch
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, code: 'invalid-request', message: 'Expected a patch object', status: 400 }
  }
  const expectedRevision = (parsed as { expectedRevision?: unknown }).expectedRevision
  if (expectedRevision !== undefined && typeof expectedRevision !== 'number') {
    return { ok: false, code: 'invalid-request', message: 'Expected a numeric expectedRevision', status: 400 }
  }
  const settings = ctx.get('settings')
  if (settings === undefined) {
    return { ok: false, code: 'settings-unavailable', message: 'The settings provider is not mounted', status: 503 }
  }
  try {
    await settings.update(
      settingsNamespace(ITRANSLATION_SETTINGS_NAMESPACE),
      patch,
      expectedRevision,
    )
    const snapshot = snapshotOf(ctx)
    return snapshot.ok
      ? { ok: true, snapshot: snapshot.snapshot }
      : { ok: false, code: snapshot.code, message: snapshot.message, status: 503 }
  } catch (error) {
    const conflict = error instanceof SettingsConflictError
    return {
      ok: false,
      code: conflict ? 'settings-conflict' : 'settings-rejected',
      message: errorMessage(error),
      status: conflict ? 409 : 400,
    }
  }
}

/** Handle the plugin settings route (GET snapshot, POST save). */
export async function handleSettings(ctx: Context, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    const snapshot = snapshotOf(ctx)
    if (!snapshot.ok) {
      sendError(res, 503, snapshot.code, snapshot.message)
      return
    }
    sendJson(res, 200, { ok: true, value: snapshot.snapshot })
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    sendError(res, 405, 'method-not-allowed', 'Use GET or POST')
    return
  }
  if (!sameOrigin(req)) {
    sendError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application')
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(await readBody(req))
  } catch (error) {
    sendError(res, error instanceof RangeError ? 413 : 400, 'invalid-request', errorMessage(error))
    return
  }
  const saved = await handleSave(ctx, parsed)
  if (!saved.ok) {
    sendError(res, saved.status, saved.code, saved.message)
    return
  }
  sendJson(res, 200, { ok: true, value: saved.snapshot })
}

/** Build the exact route for the settings endpoint. */
export function settingsRoute(ctx: Context): WebRoute {
  return {
    kind: 'exact',
    path: SETTINGS_ROUTE,
    handler: (req, res) => { void handleSettings(ctx, req, res) },
  }
}

/**
 * Mount the settings route when a web server service is present.
 * @param ctx - client package Host-half context (web plane).
 */
export function applyWebSettings(ctx: Context): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register(settingsRoute(ctx)))
  })
}
