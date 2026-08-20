/**
 * Itranslation settings store: the prompt-template page write surface. The
 * Host settings namespace is the single fact source, but the browser reaches
 * it through the plugin-owned `/_dsh/itranslation/settings` route (D69) — the
 * browser settings wire only serves allowlisted namespaces, so the page
 * fetches the plugin route instead. Load reads the route's GET snapshot,
 * save POSTs a patch, and the page re-renders from the next snapshot.
 * Mirrors the harness `ui-settings-models` page-store shape: the store owns
 * only the REDACTED wire faces this page needs, declared locally (the
 * preset's `link:` dev deps resolve the domain packages' runtime, not their
 * transitive type graph).
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Settings namespace owned by the itranslation preset (mirrors the Host-side constant). */
export const ITRANSLATION_SETTINGS_NAMESPACE = 'itranslation'

/** The four LLM prompt templates edited from the settings page. */
export interface ItranslationSettingsValue {
  preReadPrompt: string
  translatePrompt: string
  auditPrompt: string
  revisePrompt: string
}

/** Empty by design: the page provides blank textareas; users fill their own prompts. */
export const DEFAULT_ITRANSLATION_SETTINGS: ItranslationSettingsValue = {
  preReadPrompt: '',
  translatePrompt: '',
  auditPrompt: '',
  revisePrompt: '',
}

/** Page snapshot: load state, write gate, resolved value, and save errors. */
export interface ItranslationSettingsState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error'
  error: string | null
  writable: boolean
  missing: boolean
  value: ItranslationSettingsValue
  revision: number | undefined
}

/** The GET snapshot the plugin route returns for the namespace. */
export interface ItranslationSettingsView {
  value: unknown
  writable: boolean
  hasDocument: boolean
  revision: number | undefined
}

/** The plugin-route face this page consumes (load + save). */
export interface ItranslationSettingsApi {
  load: () => Promise<{ ok: true; view: ItranslationSettingsView } | { ok: false; error: string; code?: string }>
  save: (patch: ItranslationSettingsValue, expectedRevision?: number) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>
}

/**
 * Human text for a rejected fetch. A transport failure rejects with an
 * Error; a host or a runtime can reject with anything, and the page still has
 * to say something.
 * @param error - the rejection value.
 * @returns the message to show.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPrompt(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Narrow one namespace value to the page's four prompts, field by field.
 * @param value - the route snapshot's resolved section value.
 * @returns the resolved prompts, defaulting absent or malformed fields to ''.
 */
export function readSettingsValue(value: unknown): ItranslationSettingsValue {
  const root = isRecord(value) ? value : {}
  return {
    preReadPrompt: readPrompt(root.preReadPrompt),
    translatePrompt: readPrompt(root.translatePrompt),
    auditPrompt: readPrompt(root.auditPrompt),
    revisePrompt: readPrompt(root.revisePrompt),
  }
}

/** The settled result of a settings read, folding both refusal shapes. */
type SettingsRead =
  | { ok: true; writable: boolean; value: unknown; revision: number | undefined }
  | { ok: false; missing: boolean; error: string }

/**
 * Read the plugin settings route, folding both refusal shapes into one typed
 * result: the transport may reject, the route may answer an `ok: false`
 * envelope, or the backend may be absent (`settings-unavailable`, which the
 * page renders as the read-only missing notice rather than an error).
 * @param api - the plugin-route face.
 * @returns the resolved view, or the message to show in its place.
 */
async function readSettings(api: ItranslationSettingsApi): Promise<SettingsRead> {
  let result: Awaited<ReturnType<ItranslationSettingsApi['load']>>
  try {
    result = await api.load()
  } catch (error) {
    return { ok: false, missing: false, error: messageOf(error) }
  }
  if (result.ok) return { ok: true, writable: result.view.writable, value: result.view.value, revision: result.view.revision }
  if (result.code === 'settings-unavailable') return { ok: false, missing: true, error: result.error }
  return { ok: false, missing: false, error: result.error }
}

/** The settled result of a settings write, folding both refusal shapes. */
type SettingsWrite = { ok: true } | { ok: false; error: string }

/**
 * Merge one patch into the itranslation namespace's user layer.
 * @param api - the plugin-route face.
 * @param patch - the full four-prompt section; absent fields keep their
 * stored values because the provider merges rather than replaces.
 * @param expectedRevision - the revision the page read at; omitted on first save.
 * @returns the failure message, or ok once the write landed.
 */
async function writeSettings(
  api: ItranslationSettingsApi,
  patch: ItranslationSettingsValue,
  expectedRevision?: number,
): Promise<SettingsWrite> {
  let result: Awaited<ReturnType<ItranslationSettingsApi['save']>>
  try {
    result = await api.save(patch, expectedRevision)
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

/**
 * The fetch-backed plugin-route api. GET returns the snapshot; POST carries
 * the save action with an optional expectedRevision.
 * @returns the api face bound to the same-origin settings route.
 */
export function createItranslationSettingsApi(): ItranslationSettingsApi {
  return {
    async load() {
      try {
        const response = await fetch('/_dsh/itranslation/settings')
        const body = await response.json() as {
          ok?: boolean
          value?: { value?: unknown; writable?: boolean; hasDocument?: boolean; revision?: unknown }
          code?: string
          message?: string
        }
        if (!response.ok || body.ok !== true || body.value === undefined) {
          return {
            ok: false,
            error: body.message ?? `HTTP ${response.status}`,
            ...(body.code === undefined ? {} : { code: body.code }),
          }
        }
        const value = body.value
        return {
          ok: true,
          view: {
            value: value.value,
            writable: value.writable === true,
            hasDocument: value.hasDocument === true,
            revision: typeof value.revision === 'number' ? value.revision : undefined,
          },
        }
      } catch (error) {
        return { ok: false, error: messageOf(error) }
      }
    },
    async save(patch, expectedRevision) {
      try {
        const response = await fetch('/_dsh/itranslation/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'save',
            patch,
            ...(expectedRevision === undefined ? {} : { expectedRevision }),
          }),
        })
        const body = await response.json() as { ok?: boolean; code?: string; message?: string }
        if (!response.ok || body.ok !== true) {
          return {
            ok: false,
            error: body.message ?? `HTTP ${response.status}`,
            ...(body.code === undefined ? {} : { code: body.code }),
          }
        }
        return { ok: true }
      } catch (error) {
        return { ok: false, error: messageOf(error) }
      }
    },
  }
}

const INITIAL: ItranslationSettingsState = {
  status: 'idle',
  error: null,
  writable: false,
  missing: false,
  value: { ...DEFAULT_ITRANSLATION_SETTINGS },
  revision: undefined,
}

/** The prompt-template settings-page controller (one per settings surface). */
export class ItranslationSettingsController {
  /** Page snapshot the section renders from (uSES-safe store). */
  readonly store: SnapshotStore<ItranslationSettingsState> = createSnapshotStore(INITIAL)

  constructor(private readonly api: ItranslationSettingsApi) {}

  private patch(partial: Partial<ItranslationSettingsState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...partial })
  }

  private patchValue(value: ItranslationSettingsValue): void {
    this.patch({ value: { ...value }, error: null })
  }

  /**
   * Refresh the page snapshot from the plugin settings route. A deployment
   * without a settings provider renders read-only defaults rather than an
   * error: a valid deployment that mounts no provider stays usable.
   * @returns nothing; the snapshot carries the outcome.
   */
  async load(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'loading') return
    this.patch({ status: 'loading', error: null })
    const read = await readSettings(this.api)
    if (!read.ok) {
      if (read.missing) {
        this.patch({
          status: 'ready',
          error: null,
          writable: false,
          missing: true,
          value: { ...DEFAULT_ITRANSLATION_SETTINGS },
          revision: undefined,
        })
        return
      }
      this.patch({ status: 'error', error: read.error, writable: false })
      return
    }
    this.patch({
      status: 'ready',
      error: null,
      writable: read.writable,
      missing: false,
      value: readSettingsValue(read.value),
      revision: read.revision,
    })
  }

  /**
   * Merge the drafted prompts into the namespace and re-read so the Host's
   * resolved section — not the optimistic patch — becomes the page state.
   * @returns once the write settled and the snapshot reflects the Host.
   */
  async save(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status !== 'ready' || !before.writable || before.missing) return
    this.patch({ status: 'saving', error: null })
    const written = await writeSettings(this.api, before.value, before.revision)
    if (!written.ok) {
      this.patch({ status: 'ready', error: written.error })
      return
    }
    await this.load()
  }

  readonly setPreReadPrompt = (value: string): void => {
    this.patchValue({ ...this.store.getSnapshot().value, preReadPrompt: value })
  }

  readonly setTranslatePrompt = (value: string): void => {
    this.patchValue({ ...this.store.getSnapshot().value, translatePrompt: value })
  }

  readonly setAuditPrompt = (value: string): void => {
    this.patchValue({ ...this.store.getSnapshot().value, auditPrompt: value })
  }

  readonly setRevisePrompt = (value: string): void => {
    this.patchValue({ ...this.store.getSnapshot().value, revisePrompt: value })
  }
}
