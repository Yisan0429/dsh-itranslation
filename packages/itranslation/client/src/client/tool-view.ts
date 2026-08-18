/**
 * The keyed itranslation tool row. Pure presentation: it derives a summary
 * from the frozen call/result block and renders simple DOM via
 * `React.createElement` (no global DOM access).
 */

import { createElement } from 'react'
import type { ReactElement } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { summarizeToolCall } from './model'

/**
 * Render one `itranslation.*` tool call as a progress/result row.
 * @param props - the keyed toolview owner share (callId, toolName, block, ...).
 * @returns the row element.
 */
export function ItranslationToolView(props: ToolCallViewProps): ReactElement {
  const summary = summarizeToolCall(props.toolName, props.block)
  const detail = summary.detail.length > 0
    ? createElement(
      'ul',
      { className: 'itranslation-tool-view-detail' },
      summary.detail.map(line => createElement('li', { key: line, className: 'itranslation-tool-view-detail-item' }, line)),
    )
    : null
  const inspect = props.inspect === undefined
    ? null
    : createElement('button', { type: 'button', className: 'itranslation-tool-view-inspect', onClick: props.inspect }, '查看')
  return createElement(
    'div',
    {
      className: `itranslation-tool-view itranslation-tool-view-${summary.tone}`,
      'data-tool-name': props.toolName,
    },
    createElement('div', { className: 'itranslation-tool-view-title' }, summary.title),
    createElement('div', { className: 'itranslation-tool-view-headline' }, summary.headline),
    detail,
    inspect,
  )
}
