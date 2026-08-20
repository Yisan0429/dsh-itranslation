/**
 * The keyed itranslation tool row (D66). Composes the shared design-language
 * primitives (`StateDot`, `Button`, icons) with CSS Module styles resolved to
 * `--dsw-alias-*` theme tokens — no handwritten class strings, no bare
 * browser default styling. Pure presentation: it derives a summary from the
 * frozen call/result block and renders via `React.createElement` (no global
 * DOM access).
 */

import { createElement } from 'react'
import type { ReactElement } from 'react'
import { Button, IconInspectOutline12, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import clsx from 'clsx'
import { summarizeToolCall, type ToolViewTone } from './model'
import css from './tool-view.module.css'

/** Tone → primitive state-dot mapping (the row's leading status glyph). */
const DOT_STATE: Record<ToolViewTone, StateDotState> = {
  running: 'ongoing',
  ok: 'done',
  mismatch: 'warning',
  error: 'error',
}

/**
 * Render one `itranslation_*` tool call as a progress/result row.
 * @param props - the keyed toolview owner share (callId, toolName, block, ...).
 * @returns the row element.
 */
export function ItranslationToolView(props: ToolCallViewProps): ReactElement {
  const summary = summarizeToolCall(props.toolName, props.block)
  const detail = summary.detail.length > 0
    ? createElement(
      'ul',
      { className: css.detail },
      summary.detail.map(line => createElement('li', { key: line, className: css.detailItem }, line)),
    )
    : null
  const inspect = props.inspect === undefined
    ? null
    : createElement(Button, {
      variant: 'ghost',
      size: 'sm',
      className: css.inspect,
      icon: createElement(IconInspectOutline12, { key: 'icon' }),
      onClick: props.inspect,
    }, 'Inspect')
  return createElement(
    'div',
    {
      className: clsx(css.root, css[summary.tone]),
      'data-tool-name': props.toolName,
    },
    createElement('div', { className: css.row },
      createElement(StateDot, { state: DOT_STATE[summary.tone], className: css.leading }),
      createElement('span', { className: css.title }, summary.title),
      createElement('span', { className: css.sep, 'aria-hidden': true }),
      createElement('span', { className: css.headline }, summary.headline),
      inspect,
    ),
    detail,
  )
}
