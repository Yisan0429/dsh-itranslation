import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import {
  ITRANSLATION_TOOL_NAMES, readResult, resultText, summarizeToolCall, toolTitle,
} from '../src/client/model'

function running(name: string): ToolCallBlock {
  return {
    callId: 'call-1',
    name,
    argsRaw: '{}',
    turn: 1,
    step: 1,
    time: 0,
    callView: null,
    subCalls: [],
  }
}

function settled(value: unknown, extra: Partial<Extract<ToolCallBlock, { kind: 'tool-result' }>> = {}): ToolCallBlock {
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
    ...extra,
  }
}

function malformed(raw: string): ToolCallBlock {
  return settled(null, { content: [{ type: 'text', text: raw }] })
}

describe('toolTitle', () => {
  it('maps known tools to Chinese labels', () => {
    expect(toolTitle('itranslation_status')).toBe('Translation progress')
    expect(toolTitle('itranslation.prepare')).toBe('Prepare book')
  })

  it('falls back to the wire name for unknown tools', () => {
    expect(toolTitle('unknown.tool')).toBe('unknown.tool')
  })
})

describe('resultText', () => {
  it('returns null for a running call', () => {
    expect(resultText(running('itranslation_status'))).toBeNull()
  })

  it('returns the first text block of a settled call', () => {
    expect(resultText(settled({ ok: true }))).toBe('{"ok":true}')
  })

  it('returns null when the settled content has no text block', () => {
    const block = settled(null, { content: [{ type: 'reasoning', text: 'hidden' }] })
    expect(resultText(block)).toBeNull()
  })
})

describe('readResult', () => {
  it('returns null without settled text', () => {
    expect(readResult(running('itranslation_status'))).toBeNull()
  })

  it('parses valid JSON', () => {
    expect(readResult(settled({ slug: 'book' }))).toEqual({ ok: true, value: { slug: 'book' } })
  })

  it('carries malformed JSON as ok false with raw text', () => {
    expect(readResult(malformed('{'))).toEqual({ ok: false, raw: '{' })
  })
})

describe('summarizeToolCall', () => {
  it('reports a running call', () => {
    expect(summarizeToolCall('itranslation_status', running('itranslation_status'))).toEqual({
      title: 'Translation progress', headline: 'Running…', detail: [], tone: 'running',
    })
  })

  it('reports a failed tool call', () => {
    const block = settled({}, { isError: true, error: { name: 'Error', code: 'E1' } })
    expect(summarizeToolCall('itranslation_status', block)).toEqual({
      title: 'Translation progress', headline: 'Call failed', detail: ['Error'], tone: 'error',
    })
  })

  it('reports a failed call with only a code', () => {
    const block = settled({}, { isError: true, error: { name: '', code: 'E1' } })
    expect(summarizeToolCall('itranslation_status', block).detail).toEqual(['E1'])
  })

  it('reports a failed call with no error object', () => {
    expect(summarizeToolCall('itranslation_status', settled({}, { isError: true })).detail).toEqual([])
  })

  it('reports malformed result JSON', () => {
    expect(summarizeToolCall('itranslation_status', malformed('{'))).toEqual({
      title: 'Translation progress', headline: 'Result parse failed', detail: ['{'], tone: 'error',
    })
  })

  it('summarizes prepare', () => {
    const value = { title: '示例书', slug: 'shi-li-shu', chapters: [{ index: 1, title: '第一章' }] }
    expect(summarizeToolCall('itranslation.prepare', settled(value))).toEqual({
      title: 'Prepare book',
      headline: '示例书',
      detail: ['Book dir: books/shi-li-shu', 'Chapters: 1'],
      tone: 'ok',
    })
  })

  it('summarizes prepare with defaults when fields are missing', () => {
    expect(summarizeToolCall('itranslation.prepare', settled({}))).toEqual({
      title: 'Prepare book', headline: 'Prepared', detail: ['Chapters: 0'], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.prepare', settled(null))).toEqual({
      title: 'Prepare book', headline: 'Completed', detail: [], tone: 'ok',
    })
  })

  it('summarizes segment with and without overlong chapters', () => {
    const full = { chapters: [{ index: 1, paragraphs: 2 }], overlongChapters: [3, 5] }
    expect(summarizeToolCall('itranslation.segment', settled(full))).toEqual({
      title: 'Segmentation report', headline: '1 chapters', detail: ['Overlong chapters: 3, 5'], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.segment', settled({}))).toEqual({
      title: 'Segmentation report', headline: '0 chapters', detail: [], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.segment', settled(null))).toEqual({
      title: 'Segmentation report', headline: 'Completed', detail: [], tone: 'ok',
    })
  })

  it('summarizes glossary', () => {
    expect(summarizeToolCall('itranslation.glossary', settled({ entries: [{ term: 'user' }] }))).toEqual({
      title: 'Glossary', headline: '1 terms', detail: [], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.glossary', settled({}))).toEqual({
      title: 'Glossary', headline: '0 terms', detail: [], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.glossary', settled(null))).toEqual({
      title: 'Glossary', headline: 'Completed', detail: [], tone: 'ok',
    })
  })

  it('summarizes successful align and assemble', () => {
    expect(summarizeToolCall('itranslation.align', settled({ ok: true }))).toEqual({
      title: 'Alignment preview', headline: 'Aligned 0 chapters', detail: [], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.assemble', settled({ ok: true, outputFile: 'books/x/x.md' }))).toEqual({
      title: 'Assemble book', headline: 'Book assembled', detail: ['Output: books/x/x.md'], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.assemble', settled({ ok: true }))).toEqual({
      title: 'Assemble book', headline: 'Book assembled', detail: [], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation.align', settled(null))).toEqual({
      title: 'Alignment preview', headline: 'Completed', detail: [], tone: 'ok',
    })
  })

  it('summarizes mismatch with and without detail', () => {
    const value = { ok: false, mismatch: { chapterIndex: 2, expected: 5, actual: 6 }, message: '段数失配' }
    expect(summarizeToolCall('itranslation.align', settled(value))).toEqual({
      title: 'Alignment preview',
      headline: 'Alignment mismatch',
      detail: ['Chapter 2: expected 5, got 6', '段数失配'],
      tone: 'mismatch',
    })
    expect(summarizeToolCall('itranslation.assemble', settled({ ok: false }))).toEqual({
      title: 'Assemble book', headline: 'Assembly mismatch', detail: [], tone: 'mismatch',
    })
    expect(summarizeToolCall('itranslation.align', settled({ ok: false, mismatch: {} }))).toEqual({
      title: 'Alignment preview', headline: 'Alignment mismatch', detail: ['Chapter ?: expected ?, got ?'], tone: 'mismatch',
    })
  })

  it('falls back to generic for a non-boolean ok field', () => {
    expect(summarizeToolCall('itranslation.align', settled({ ok: 'yes' }))).toEqual({
      title: 'Alignment preview', headline: 'Completed', detail: [], tone: 'ok',
    })
  })

  it('summarizes status with known and unknown phases', () => {
    expect(summarizeToolCall('itranslation_status', settled({ translatedChapters: 2, totalChapters: 5, phase: 'translating' }))).toEqual({
      title: 'Translation progress', headline: '2/5 chapters translated', detail: ['Phase: Translating'], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation_status', settled({ phase: 'mystery' }))).toEqual({
      title: 'Translation progress', headline: '0/0 chapters translated', detail: ['Phase: mystery'], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation_status', settled({}))).toEqual({
      title: 'Translation progress', headline: '0/0 chapters translated', detail: ['Phase: '], tone: 'ok',
    })
    expect(summarizeToolCall('itranslation_status', settled(null))).toEqual({
      title: 'Translation progress', headline: 'Completed', detail: [], tone: 'ok',
    })
  })

  it('falls back to generic for unknown parsed tools', () => {
    expect(summarizeToolCall('itranslation.unknown', settled({ ok: true }))).toEqual({
      title: 'itranslation.unknown', headline: 'Completed', detail: [], tone: 'ok',
    })
  })

  it('lists every deterministic tool name', () => {
    expect(ITRANSLATION_TOOL_NAMES).toHaveLength(6)
    expect(ITRANSLATION_TOOL_NAMES).toContain('itranslation_status')
  })
})
