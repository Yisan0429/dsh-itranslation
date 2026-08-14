import { describe, expect, it } from 'vitest'
import { countSentences, engineVersion, segmentParagraphs, slugify } from '../src/index'

describe('core package surface', () => {
  it('exposes the deterministic engine functions', () => {
    expect(slugify).toBeTypeOf('function')
    expect(segmentParagraphs).toBeTypeOf('function')
    expect(countSentences).toBeTypeOf('function')
  })

  it('stamps the deterministic engine version', () => {
    expect(engineVersion).toBe('0.1.0')
  })
})
