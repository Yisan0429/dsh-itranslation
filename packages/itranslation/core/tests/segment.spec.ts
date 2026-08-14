import { describe, expect, it } from 'vitest'
import { countSentences, segmentParagraphs } from '../src/index'

describe('countSentences', () => {
  it('counts empty and whitespace-only text as zero sentences', () => {
    expect(countSentences('')).toBe(0)
    expect(countSentences('   ')).toBe(0)
  })

  it('counts one sentence for text without terminators', () => {
    expect(countSentences('plain text')).toBe(1)
  })

  it('counts sentences terminated by latin and chinese punctuation', () => {
    expect(countSentences('one. two? three!')).toBe(3)
    expect(countSentences('你好。世界！')).toBe(2)
  })

  it('treats consecutive terminators as one boundary', () => {
    expect(countSentences('wait!? go.')).toBe(2)
  })

  it('counts terminator-only text as one sentence', () => {
    expect(countSentences('!!!')).toBe(1)
    expect(countSentences('……')).toBe(1)
  })
})

describe('segmentParagraphs', () => {
  it('returns an empty list for empty or blank chapters', () => {
    expect(segmentParagraphs('')).toEqual([])
    expect(segmentParagraphs('\n\n  \n')).toEqual([])
  })

  it('keeps single line breaks inside one paragraph', () => {
    const segments = segmentParagraphs('line one\nline two')
    expect(segments).toHaveLength(1)
    expect(segments[0]).toEqual({ index: 1, text: 'line one\nline two', sentenceCount: 1 })
  })

  it('splits on blank lines, trims and numbers 1-based with sentence counts', () => {
    const chapter = '第一段。两个句子。\n\n  第二段!\n\nthird paragraph.'
    const segments = segmentParagraphs(chapter)
    expect(segments).toEqual([
      { index: 1, text: '第一段。两个句子。', sentenceCount: 2 },
      { index: 2, text: '第二段!', sentenceCount: 1 },
      { index: 3, text: 'third paragraph.', sentenceCount: 1 },
    ])
  })
})
