// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { ItranslationToolView } from '../src/client/tool-view'

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

function settledRaw(text: string): ToolCallBlock {
  return {
    ...settled({}),
    content: [{ type: 'text', text }],
  }
}

function settledError(value: unknown): ToolCallBlock {
  return {
    ...settled(value),
    isError: true,
    error: { name: 'boom', code: 'boom-code' },
  }
}

/** An in-flight call: no settled result yet (no `kind` field). */
function running(): ToolCallBlock {
  return {
    seq: 1,
    time: 0,
    callId: 'call-1',
    call: { name: 'itranslation_status', argsRaw: '{}' },
    callView: null,
    resultView: null,
    subCalls: [],
  } as unknown as ToolCallBlock
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
  afterEach(() => {
    cleanup()
  })

  it('renders a running row with the ongoing state dot and no chrome extras', () => {
    const { container } = render(ItranslationToolView(props('itranslation_status', running())))
    expect(container.querySelector('[data-tool-name="itranslation_status"]')).not.toBeNull()
    expect(screen.getByText('Translation progress')).toBeTruthy()
    expect(screen.getByText('Running…')).toBeTruthy()
    expect(document.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a result row with detail, the done dot, and a working Inspect button', () => {
    const inspect = vi.fn()
    render(ItranslationToolView(props(
      'itranslation_status',
      settled({ translatedChapters: 2, totalChapters: 5, phase: 'translating' }),
      inspect,
    )))
    expect(screen.getByText('Translation progress')).toBeTruthy()
    expect(screen.getByText('2/5 chapters translated')).toBeTruthy()
    expect(screen.getByText('Phase: Translating')).toBeTruthy()
    expect(document.querySelector('[data-state="done"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Inspect/ }))
    expect(inspect).toHaveBeenCalledOnce()
  })

  it('renders a mismatch row with the warning dot and the drift detail', () => {
    render(ItranslationToolView(props(
      'itranslation_align',
      settled({ ok: false, mismatch: { chapterIndex: 1, expected: 2, actual: 3 }, message: 'drift' }),
    )))
    expect(screen.getByText('Alignment mismatch')).toBeTruthy()
    expect(screen.getByText('Chapter 1: expected 2, got 3')).toBeTruthy()
    expect(document.querySelector('[data-state="warning"]')).not.toBeNull()
  })

  it('renders a failed call row with the error dot', () => {
    render(ItranslationToolView(props('itranslation_assemble', settledError({}))))
    expect(screen.getByText('Call failed')).toBeTruthy()
    expect(document.querySelector('[data-state="error"]')).not.toBeNull()
  })

  it('renders a parse-failure row with the raw result', () => {
    render(ItranslationToolView(props('itranslation_assemble', settledRaw('not json'))))
    expect(screen.getByText('Result parse failed')).toBeTruthy()
    expect(screen.getByText('not json')).toBeTruthy()
    expect(document.querySelector('[data-state="error"]')).not.toBeNull()
  })

  it('omits detail and inspect when absent', () => {
    const { container } = render(ItranslationToolView(props('itranslation_align', settled({ ok: true }))))
    expect(screen.getByText('Aligned 0 chapters')).toBeTruthy()
    expect(container.querySelector('ul')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
