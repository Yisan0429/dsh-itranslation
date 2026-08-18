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
  auto: '自动判断',
  fiction: '虚构文学',
  'non-fiction': '非虚构',
  technical: '技术/专业',
  children: '童书',
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
  if (state.status === 'loading') return createElement('p', { className: 'itranslation-settings-status' }, '正在读取整本书翻译设置…')
  if (state.status === 'error') return createElement('p', { className: 'itranslation-settings-error' }, `读取失败：${state.error}`)
  const disabled = state.status === 'saving' || !state.writable
  return createElement(
    'div',
    { className: 'itranslation-settings' },
    createElement('p', { className: 'itranslation-settings-intro' }, '整本书翻译的第 0 步问题卡会以这些默认值开始。'),
    state.missing
      ? createElement('p', { className: 'itranslation-settings-missing' }, '未检测到 itranslation 设置命名空间，当前显示内置默认值，无法保存。')
      : null,
    createElement(
      'label',
      { className: 'itranslation-field' },
      '体裁默认',
      createElement(
        'select',
        { value: state.value.genre, disabled, onChange: setGenre },
        GENRE_OPTIONS.map(option => createElement('option', { key: option, value: option }, GENRE_LABELS[option] ?? option)),
      ),
    ),
    createElement(
      'label',
      { className: 'itranslation-field' },
      '术语确认模式',
      createElement(
        'select',
        { value: state.value.terminologyMode, disabled, onChange: setTerminologyMode },
        createElement('option', { value: 'auto' }, '自动'),
        createElement('option', { value: 'manual' }, '人工协同'),
      ),
    ),
    createElement(
      'button',
      { type: 'button', className: 'itranslation-settings-save', disabled, onClick: save },
      state.status === 'saving' ? '保存中…' : '保存默认值',
    ),
    state.error === null ? null : createElement('p', { className: 'itranslation-settings-error' }, state.error),
  )
}
