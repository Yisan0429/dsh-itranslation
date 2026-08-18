/**
 * Settings controller for the itranslation settings page. It reads and
 * writes the `itranslation` settings namespace through the DSH connection
 * API and exposes a tiny observable store the section binds with
 * `bindSnapshotSelector`.
 */

import type { ChangeEvent } from 'react'
import { createObservable } from './observable'

/** Settings namespace owned by the itranslation preset (DESIGN.md §7). */
export const ITRANSLATION_SETTINGS_NAMESPACE = 'itranslation'

type TerminologyMode = 'auto' | 'manual'

/** Genre/terminology defaults offered by the step-0 confirmation card. */
export interface ItranslationSettingsValue {
  genre: string
  terminologyMode: TerminologyMode
}

export const DEFAULT_ITRANSLATION_SETTINGS: ItranslationSettingsValue = {
  genre: 'auto',
  terminologyMode: 'auto',
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

const INITIAL: ItranslationSettingsState = {
  status: 'idle',
  error: null,
  writable: false,
  missing: false,
  value: { ...DEFAULT_ITRANSLATION_SETTINGS },
  revision: undefined,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readGenre(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : DEFAULT_ITRANSLATION_SETTINGS.genre
}

function readTerminologyMode(value: unknown): TerminologyMode {
  return value === 'manual' ? 'manual' : 'auto'
}

/**
 * Fold a settings namespace's redacted value into the local shape, falling
 * back field-by-field to the built-in defaults.
 */
export function readSettingsValue(value: unknown): ItranslationSettingsValue {
  const root = isRecord(value) ? value : {}
  return {
    genre: readGenre(root.genre),
    terminologyMode: readTerminologyMode(root.terminologyMode),
  }
}

/** Human message for a rejected wire call (transport or business refusal). */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface SettingsNamespaceLike {
  ns: string
  value: unknown
  revision: number
}

function namespaceOf(namespaces: readonly SettingsNamespaceLike[]): SettingsNamespaceLike | undefined {
  return namespaces.find(namespace => namespace.ns === ITRANSLATION_SETTINGS_NAMESPACE)
}

type SettingsRpcResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

/** Structural slice of the DSH connection settings API used by this section. */
export interface SettingsApi {
  settings: {
    describe(_request: Record<string, never>): Promise<{
      result: SettingsRpcResult<{ writable: boolean; namespaces: SettingsNamespaceLike[] }>
    }>
    update(_request: { ns: string; patch: object; expectedRevision?: number }): Promise<{
      result: SettingsRpcResult<SettingsNamespaceLike>
    }>
  }
}

/** Narrow an unknown connection/api value to the settings slice. */
export function isSettingsApi(value: unknown): value is SettingsApi {
  if (typeof value !== 'object' || value === null) return false
  const settings = (value as { settings?: unknown }).settings
  return typeof settings === 'object'
    && settings !== null
    && typeof (settings as { describe?: unknown }).describe === 'function'
    && typeof (settings as { update?: unknown }).update === 'function'
}

/** Controller owned by one settings-section registration. */
export class ItranslationSettingsController {
  readonly store = createObservable<ItranslationSettingsState>(INITIAL)

  constructor(private readonly api: SettingsApi) {}

  private patch(patch: Partial<ItranslationSettingsState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private patchValue(value: ItranslationSettingsValue): void {
    this.patch({ value: { ...value }, error: null })
  }

  readonly load = async (): Promise<void> => {
    if (this.store.getSnapshot().status === 'loading') return
    this.patch({ status: 'loading', error: null })
    let writable: boolean
    let namespaces: readonly SettingsNamespaceLike[]
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
    const namespace = namespaceOf(namespaces)
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

  readonly setGenre = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = this.store.getSnapshot().value
    this.patchValue({ ...value, genre: event.target.value })
  }

  readonly setTerminologyMode = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = this.store.getSnapshot().value
    this.patchValue({ ...value, terminologyMode: readTerminologyMode(event.target.value) })
  }

  readonly save = (): void => { void this.persist() }
}
