import { describe, expect, it } from 'vitest'
import { TranslationMismatchError } from '@yisan0429/dsh-itranslation-core'
import { mismatchFromError } from '../src/mismatch'

describe('mismatchFromError', () => {
  it('extracts a structured report from a TranslationMismatchError', () => {
    const error = new TranslationMismatchError('paragraph-count', 3, 12, 11)
    expect(mismatchFromError(error)).toEqual({
      report: { kind: 'paragraph-count', chapterIndex: 3, expected: 12, actual: 11 },
      message: error.message,
    })
  })

  it('re-throws a non-mismatch error', () => {
    const error = new Error('boom')
    expect(() => mismatchFromError(error)).toThrow('boom')
  })
})
