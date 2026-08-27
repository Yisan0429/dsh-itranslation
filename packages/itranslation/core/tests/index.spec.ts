import { describe, expect, it } from 'vitest'
import {
  assembleBook,
  assembleChapter,
  countSentences,
  createBookState,
  detectChapters,
  engineVersion,
  joinChapterFragments,
  normalizeMarkdown,
  segmentParagraphs,
  slugify,
  stripHeadingAttributes,
  TranslationMismatchError,
} from '../src/index'

describe('core package surface', () => {
  it('exposes the deterministic engine functions', () => {
    expect(slugify).toBeTypeOf('function')
    expect(segmentParagraphs).toBeTypeOf('function')
    expect(countSentences).toBeTypeOf('function')
    expect(detectChapters).toBeTypeOf('function')
    expect(createBookState).toBeTypeOf('function')
    expect(assembleBook).toBeTypeOf('function')
    expect(assembleChapter).toBeTypeOf('function')
    expect(joinChapterFragments).toBeTypeOf('function')
    expect(normalizeMarkdown).toBeTypeOf('function')
    expect(stripHeadingAttributes).toBeTypeOf('function')
    expect(TranslationMismatchError).toBeTypeOf('function')
  })

  it('stamps the deterministic engine version', () => {
    expect(engineVersion).toBe('1.0.0')
  })
})
