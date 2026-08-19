/**
 * Settings store for the itranslation prompt page. The host settings
 * namespace is the single fact source: load reads `settings.describe`,
 * save writes `settings.update`, and the page re-renders from the next
 * snapshot. Mirrors the harness `ui-settings-models` page-store shape.
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Settings namespace owned by the itranslation preset. */
export const ITRANSLATION_SETTINGS_NAMESPACE = 'itranslation'

/** The four LLM prompt templates edited from the settings page. */
export interface ItranslationSettingsValue {
  preReadPrompt: string
  translatePrompt: string
  auditPrompt: string
  revisePrompt: string
}

export const DEFAULT_ITRANSLATION_SETTINGS: ItranslationSettingsValue = {
  preReadPrompt: '',
  translatePrompt: '',
  auditPrompt: '',
  revisePrompt: '',
}

/** Section snapshot: load state, write gate, resolved value and save errors. */
export interface ItranslationSettingsState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error'
  error: string | null
  writable: boolean
  missing: boolean
  value: ItranslationSettingsValue
  revision: number | undefined
}

/** Human message for a rejected wire call (transport or business refusal). */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPrompt(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Fold a namespace view's value into the local shape, field by field. */
export function readSettingsValue(value: unknown): ItranslationSettingsValue {
  const root = isRecord(value) ? value : {}
  return {
    preReadPrompt: readPrompt(root.preReadPrompt),
    translatePrompt: readPrompt(root.translatePrompt),
    auditPrompt: readPrompt(root.auditPrompt),
    revisePrompt: readPrompt(root.revisePrompt),
  }
}

/** Redacted namespace view this page needs from `settings.describe`. */
interface SettingsNamespaceView {
  ns: string
  value: unknown
  revision: number
}

type SettingsRpcResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

/** The settings wire face this page needs. */
export interface ItranslationSettingsApi {
  settings: {
    describe(_request: Record<string, never>): Promise<{
      result: SettingsRpcResult<{ writable: boolean; namespaces: SettingsNamespaceView[] }>
    }>
    update(_request: { ns: string; patch: object; expectedRevision?: number }): Promise<{
      result: SettingsRpcResult<SettingsNamespaceView>
    }>
  }
}

/** Controller owned by one settings-section registration. */
export class ItranslationSettingsController {
  readonly store: SnapshotStore<ItranslationSettingsState> = createSnapshotStore<ItranslationSettingsState>({
    status: 'idle', error: null, writable: false, missing: false,
    value: { ...DEFAULT_ITRANSLATION_SETTINGS }, revision: undefined,
  })

  constructor(private readonly api: ItranslationSettingsApi) {}

  private patch(patch: Partial<ItranslationSettingsState>): void {
    this.store.update((s) => { Object.assign(s, patch) })
  }

  private patchValue(value: ItranslationSettingsValue): void {
    this.store.update((s) => {
      s.value = { ...value }
      s.error = null
    })
  }

  readonly load = async (): Promise<void> => {
    if (this.store.getSnapshot().status === 'loading') return
    this.patch({ status: 'loading', error: null })
    let writable: boolean
    let namespaces: SettingsNamespaceView[]
    try {
      const response = await this.api.settings.describe({})
      if (!response.result.ok) {
        this.patch({ status: 'error', error: response.result.error.message, writable: false })
        return
      }
      writable = response.result.value.writable
      namespaces = response.result.value.namespaces
    } catch (error) {
      this.patch({ status: 'error', error: messageOf(error), writable: false })
      return
    }
    const namespace = namespaces.find(item => item.ns === ITRANSLATION_SETTINGS_NAMESPACE)
    if (namespace === undefined) {
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
    this.patch({
      status: 'ready',
      error: null,
      writable,
      missing: false,
      value: readSettingsValue(namespace.value),
      revision: namespace.revision,
    })
  }

  private async persist(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status !== 'ready' || !before.writable || before.missing) return
    this.patch({ status: 'saving', error: null })
    try {
      const response = await this.api.settings.update({
        ns: ITRANSLATION_SETTINGS_NAMESPACE,
        patch: before.value,
        ...(before.revision === undefined ? {} : { expectedRevision: before.revision }),
      })
      if (!response.result.ok) {
        this.patch({ status: 'ready', error: response.result.error.message })
        return
      }
    } catch (error) {
      this.patch({ status: 'ready', error: messageOf(error) })
      return
    }
    await this.load()
  }

  readonly setPreReadPrompt = (value: string): void => {
    const current = this.store.getSnapshot().value
    this.patchValue({ ...current, preReadPrompt: value })
  }

  readonly setTranslatePrompt = (value: string): void => {
    const current = this.store.getSnapshot().value
    this.patchValue({ ...current, translatePrompt: value })
  }

  readonly setAuditPrompt = (value: string): void => {
    const current = this.store.getSnapshot().value
    this.patchValue({ ...current, auditPrompt: value })
  }

  readonly setRevisePrompt = (value: string): void => {
    const current = this.store.getSnapshot().value
    this.patchValue({ ...current, revisePrompt: value })
  }

  readonly save = (): void => { void this.persist() }
}
