import { describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { ItranslationToolView } from '../src/client/tool-view'

interface TextChild {
  type: string
  props: { children: string }
}

interface ListChild {
  type: string
  props: { children: TextChild[] }
}

interface ButtonChild {
  type: string
  props: { onClick: () => void }
}

interface RowElement {
  type: string
  props: {
    'data-tool-name': string
    className: string
    children: [TextChild, TextChild, ListChild | null, ButtonChild | null]
  }
}

function settled(value: unknown): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: 0,
    callId: 'call-1',
    call: { name: 'itranslation_status', argsRaw: '{}' },
    callTime: 0,
    content: [{ type: 'text', text: JSON.stringify(value) }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function props(toolName: string, block: ToolCallBlock, inspect?: () => void): ToolCallViewProps {
  return {
    callId: 'call-1',
    toolName,
    block,
    openFile: () => {},
    ...(inspect === undefined ? {} : { inspect }),
  } as ToolCallViewProps
}

describe('ItranslationToolView', () => {
  it('renders a result row with detail and inspect', () => {
    const inspect = vi.fn()
    const element = ItranslationToolView(props('itranslation_status', settled({ translatedChapters: 2, totalChapters: 5, phase: 'translating' }), inspect)) as unknown as RowElement
    expect(element.type).toBe('div')
    expect(element.props['data-tool-name']).toBe('itranslation_status')
    expect(element.props.className).toContain('itranslation-tool-view-ok')
    const [title, headline, detail, inspectButton] = element.props.children
    if (detail === null || inspectButton === null) throw new Error('expected detail and inspect')
    const detailItem = detail.props.children[0]
    if (detailItem === undefined) throw new Error('expected a detail item')
    expect(title.props.children).toBe('Translation progress')
    expect(headline.props.children).toBe('2/5 chapters translated')
    expect(detail.type).toBe('ul')
    expect(detail.props.children).toHaveLength(1)
    expect(detailItem.props.children).toBe('Phase: Translating')
    expect(inspectButton.type).toBe('button')
    expect(inspectButton.props.onClick).toBe(inspect)
  })

  it('omits detail and inspect when absent', () => {
    const element = ItranslationToolView(props('itranslation.align', settled({ ok: true }))) as unknown as RowElement
    const children = element.props.children
    expect(children).toHaveLength(4)
    expect(children[2]).toBeNull()
    expect(children[3]).toBeNull()
  })
})
