/**
 * The itranslation settings section (D66): four prompt templates for the LLM
 * steps (pre-reading, translation, audit, revision). Composes the shared
 * `Button` primitive with CSS Module styles resolved to `--dsw-alias-*`
 * theme tokens; the multi-line prompt fields stay native `<textarea>`s (the
 * primitives' `Input` atom is single-line only), styled through the theme.
 * Mirrors the harness settings-section shape: the slot outlet spreads the
 * inject face flat, so props are the partial injected dependencies.
 */

import { createElement } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-web-react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ItranslationSettingsController, ItranslationSettingsState } from './settings-store'
import type { SettingsKey } from './settings-locales'
import css from './settings-section.module.css'

/** Injected dependencies of the itranslation settings section. */
export interface ItranslationSettingsInjected {
  /** The page controller (loads on mount, saves through the wire). */
  controller: ItranslationSettingsController
  /** uSES subscription hook bound to the controller store. */
  useSnapshot: SnapshotSelectorHook<ItranslationSettingsState>
  /** Section copy. */
  t: (key: SettingsKey) => string
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
 * @param props - the inject face carrying controller/useSnapshot/t.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ItranslationSettingsSection(props: ItranslationSettingsProps): ReactElement | null {
  const { controller, useSnapshot, t } = props
  if (controller === undefined || useSnapshot === undefined || t === undefined) return null
  const state = useSnapshot(snapshot => snapshot)
  if (state.status === 'idle') void controller.load()
  if (state.status === 'loading') return createElement('p', { className: css.status }, t('loading'))
  if (state.status === 'error') return createElement('p', { className: css.error }, `${t('failed')} ${state.error}`)
  const disabled = state.status === 'saving' || !state.writable
  return createElement(
    'div',
    { className: css.settings },
    createElement('p', { className: css.intro }, t('intro')),
    state.missing
      ? createElement('p', { className: css.missing }, t('missing'))
      : null,
    PROMPT_FIELDS.map(field => createElement(
      'label',
      { key: field.key, className: css.field },
      createElement('span', { className: css.fieldLabel }, t(field.labelKey)),
      createElement(
        'textarea',
        {
          className: css.promptInput,
          value: state.value[field.key],
          disabled,
          placeholder: t(field.labelKey),
          rows: 6,
          onChange: (event: ChangeEvent<HTMLTextAreaElement>) => { SETTERS[field.key](controller, event.target.value) },
        },
      ),
    )),
    createElement(
      Button,
      { variant: 'primary', disabled, className: css.save, onClick: () => { void controller.save() } },
      state.status === 'saving' ? t('saving') : t('save'),
    ),
    state.error === null ? null : createElement('p', { className: css.error }, state.error),
  )
}
