/**
 * The itranslation settings section: four prompt templates for the LLM
 * steps (pre-reading, translation, audit, revision). Mirrors the harness
 * settings-section shape: the slot outlet spreads the inject face flat, so
 * props are the partial injected dependencies.
 */

import { createElement } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-web-react'
import type { ItranslationSettingsController, ItranslationSettingsState } from './settings-store'
import type { en } from './settings-locales'

/** Injected dependencies of the itranslation settings section. */
export interface ItranslationSettingsInjected {
  /** The page controller (loads on mount, saves through the wire). */
  controller: ItranslationSettingsController
  /** uSES subscription hook bound to the controller store. */
  useSnapshot: SnapshotSelectorHook<ItranslationSettingsState>
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/** Props delivered by the slot outlet: the inject face spread flat. */
export type ItranslationSettingsProps = Partial<ItranslationSettingsInjected>

const PROMPT_FIELDS = [
  { key: 'preReadPrompt', labelKey: 'preRead' },
  { key: 'translatePrompt', labelKey: 'translate' },
  { key: 'auditPrompt', labelKey: 'audit' },
  { key: 'revisePrompt', labelKey: 'revise' },
] as const

const SETTERS = {
  preReadPrompt: (controller: ItranslationSettingsController, value: string) => { controller.setPreReadPrompt(value) },
  translatePrompt: (controller: ItranslationSettingsController, value: string) => { controller.setTranslatePrompt(value) },
  auditPrompt: (controller: ItranslationSettingsController, value: string) => { controller.setAuditPrompt(value) },
  revisePrompt: (controller: ItranslationSettingsController, value: string) => { controller.setRevisePrompt(value) },
} as const

/**
 * Render the settings section.
 * @param props - slot runtime share plus the injected store/action face.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ItranslationSettingsSection(props: ItranslationSettingsProps): ReactElement | null {
  const { controller, useSnapshot, t } = props
  if (controller === undefined || useSnapshot === undefined || t === undefined) return null
  const state = useSnapshot(snapshot => snapshot)
  if (state.status === 'idle') void controller.load()
  if (state.status === 'loading') return createElement('p', { className: 'itranslation-settings-status' }, t('loading'))
  if (state.status === 'error') return createElement('p', { className: 'itranslation-settings-error' }, `${t('failed')} ${state.error}`)
  const disabled = state.status === 'saving' || !state.writable
  return createElement(
    'div',
    { className: 'itranslation-settings' },
    createElement('p', { className: 'itranslation-settings-intro' }, t('intro')),
    state.missing
      ? createElement('p', { className: 'itranslation-settings-missing' }, t('missing'))
      : null,
    PROMPT_FIELDS.map(field => createElement(
      'label',
      { key: field.key, className: 'itranslation-field' },
      t(field.labelKey),
      createElement(
        'textarea',
        {
          className: 'itranslation-prompt-input',
          value: state.value[field.key],
          disabled,
          placeholder: t(field.labelKey),
          rows: 6,
          onChange: (event: ChangeEvent<HTMLTextAreaElement>) => { SETTERS[field.key](controller, event.target.value) },
        },
      ),
    )),
    createElement(
      'button',
      { type: 'button', className: 'itranslation-settings-save', disabled, onClick: controller.save },
      state.status === 'saving' ? t('saving') : t('save'),
    ),
    state.error === null ? null : createElement('p', { className: 'itranslation-settings-error' }, state.error),
  )
}
