/**
 * The itranslation settings section: genre and terminology-mode defaults
 * for the step-0 confirmation card (DESIGN.md §7). The section renders only
 * from its injected store and action callbacks; all wire access stays in
 * `settings-store.ts`.
 */

import { createElement } from 'react'
import type { ReactElement } from 'react'
import type { ChangeEvent } from 'react'
import type { InjectFace, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ItranslationSettingsState } from './settings-store'

/** Injected business face delivered to the settings section. */
interface ItranslationSettingsInjected {
  useSnapshot?: SnapshotSelectorHook<ItranslationSettingsState>
  load?: () => Promise<void>
  setGenre?: (event: ChangeEvent<HTMLInputElement>) => void
  setTerminologyMode?: (event: ChangeEvent<HTMLSelectElement>) => void
  save?: () => void
}

export type ItranslationSettingsProps = PropsRuntime<'settings.section'> & InjectFace<ItranslationSettingsInjected>

const GENRE_OPTIONS = ['auto', 'fiction', 'non-fiction', 'technical', 'children', 'other'] as const

const GENRE_LABELS: Partial<Record<(typeof GENRE_OPTIONS)[number], string>> = {
  auto: 'Auto',
  fiction: 'Fiction',
  'non-fiction': 'Non-fiction',
  technical: 'Technical',
  children: 'Children',
}

/**
 * Render the settings section.
 * @param props - slot runtime share plus the injected store/action face.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ItranslationSettingsSection(props: ItranslationSettingsProps): ReactElement | null {
  const { useSnapshot, load, setGenre, setTerminologyMode, save } = props
  if (
    useSnapshot === undefined
    || load === undefined
    || setGenre === undefined
    || setTerminologyMode === undefined
    || save === undefined
  ) return null
  const state = useSnapshot(snapshot => snapshot)
  if (state.status === 'idle') void load()
  if (state.status === 'loading') return createElement('p', { className: 'itranslation-settings-status' }, 'Loading Itranslation settings…')
  if (state.status === 'error') return createElement('p', { className: 'itranslation-settings-error' }, `Failed to load: ${state.error}`)
  const disabled = state.status === 'saving' || !state.writable
  return createElement(
    'div',
    { className: 'itranslation-settings' },
    createElement('p', { className: 'itranslation-settings-intro' }, 'The step-0 confirmation card starts with these defaults.'),
    state.missing
      ? createElement('p', { className: 'itranslation-settings-missing' }, 'The itranslation settings namespace was not detected; showing built-in defaults, saving unavailable.')
      : null,
    createElement(
      'label',
      { className: 'itranslation-field' },
      'Default genre',
      createElement(
        'select',
        { value: state.value.genre, disabled, onChange: setGenre },
        GENRE_OPTIONS.map(option => createElement('option', { key: option, value: option }, GENRE_LABELS[option] ?? option)),
      ),
    ),
    createElement(
      'label',
      { className: 'itranslation-field' },
      'Terminology mode',
      createElement(
        'select',
        { value: state.value.terminologyMode, disabled, onChange: setTerminologyMode },
        createElement('option', { value: 'auto' }, 'Auto'),
        createElement('option', { value: 'manual' }, 'Manual'),
      ),
    ),
    createElement(
      'button',
      { type: 'button', className: 'itranslation-settings-save', disabled, onClick: save },
      state.status === 'saving' ? 'Saving…' : 'Save defaults',
    ),
    state.error === null ? null : createElement('p', { className: 'itranslation-settings-error' }, state.error),
  )
}
