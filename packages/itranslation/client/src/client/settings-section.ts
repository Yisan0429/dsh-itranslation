/**
 * The itranslation settings section: four prompt templates for the LLM
 * steps (pre-reading, translation, audit, revision). The section renders
 * only from its injected store and action callbacks; all wire access stays
 * in `settings-store.ts`.
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
  setPreReadPrompt?: (event: ChangeEvent<HTMLTextAreaElement>) => void
  setTranslatePrompt?: (event: ChangeEvent<HTMLTextAreaElement>) => void
  setAuditPrompt?: (event: ChangeEvent<HTMLTextAreaElement>) => void
  setRevisePrompt?: (event: ChangeEvent<HTMLTextAreaElement>) => void
  save?: () => void
}

export type ItranslationSettingsProps = PropsRuntime<'settings.section'> & InjectFace<ItranslationSettingsInjected>

const FIELDS = [
  { key: 'preReadPrompt', label: 'Pre-reading prompt', setter: 'setPreReadPrompt' },
  { key: 'translatePrompt', label: 'Translation prompt', setter: 'setTranslatePrompt' },
  { key: 'auditPrompt', label: 'Audit prompt', setter: 'setAuditPrompt' },
  { key: 'revisePrompt', label: 'Revision prompt', setter: 'setRevisePrompt' },
] as const

/**
 * Render the settings section.
 * @param props - slot runtime share plus the injected store/action face.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ItranslationSettingsSection(props: ItranslationSettingsProps): ReactElement | null {
  const { useSnapshot, load, setPreReadPrompt, setTranslatePrompt, setAuditPrompt, setRevisePrompt, save } = props
  if (
    useSnapshot === undefined
    || load === undefined
    || setPreReadPrompt === undefined
    || setTranslatePrompt === undefined
    || setAuditPrompt === undefined
    || setRevisePrompt === undefined
    || save === undefined
  ) return null
  const state = useSnapshot(snapshot => snapshot)
  if (state.status === 'idle') void load()
  if (state.status === 'loading') return createElement('p', { className: 'itranslation-settings-status' }, 'Loading Itranslation settings…')
  if (state.status === 'error') return createElement('p', { className: 'itranslation-settings-error' }, `Failed to load: ${state.error}`)
  const disabled = state.status === 'saving' || !state.writable
  const setters = { setPreReadPrompt, setTranslatePrompt, setAuditPrompt, setRevisePrompt }
  return createElement(
    'div',
    { className: 'itranslation-settings' },
    createElement('p', { className: 'itranslation-settings-intro' }, 'Prompt templates used by the agent for each LLM step. Leave blank to use no extra prompt.'),
    state.missing
      ? createElement('p', { className: 'itranslation-settings-missing' }, 'The itranslation settings namespace was not detected; saving is unavailable.')
      : null,
    FIELDS.map(field => createElement(
      'label',
      { key: field.key, className: 'itranslation-field' },
      field.label,
      createElement(
        'textarea',
        {
          className: 'itranslation-prompt-input',
          value: state.value[field.key],
          disabled,
          placeholder: field.label,
          rows: 6,
          onChange: setters[field.setter],
        },
      ),
    )),
    createElement(
      'button',
      { type: 'button', className: 'itranslation-settings-save', disabled, onClick: save },
      state.status === 'saving' ? 'Saving…' : 'Save prompts',
    ),
    state.error === null ? null : createElement('p', { className: 'itranslation-settings-error' }, state.error),
  )
}
