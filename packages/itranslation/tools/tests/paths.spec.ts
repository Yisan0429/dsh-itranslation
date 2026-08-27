import { describe, expect, it } from 'vitest'
import {
  alignedRel,
  auditRel,
  bookDirRel,
  bookSlug,
  chapterRel,
  chaptersDirRel,
  fragmentRel,
  glossaryRel,
  inputDirRel,
  metaRel,
  outputRel,
  sourceRel,
  stateRel,
  titleFromPath,
} from '../src/paths'

describe('paths', () => {
  it('derives a slug from the title and prefixes the produce directory', () => {
    expect(bookSlug('三体')).toBe('三体')
    expect(bookDirRel('三体')).toBe('produce/三体')
  })

  it('builds every artifact path under the book directory', () => {
    expect(stateRel('s')).toBe('produce/s/state.json')
    expect(sourceRel('s', 3)).toBe('produce/s/source/3.md')
    expect(chaptersDirRel('s')).toBe('produce/s/chapters')
    expect(chapterRel('s', 3)).toBe('produce/s/chapters/3.md')
    expect(fragmentRel('s', 3, 2)).toBe('produce/s/chapters/3.2.md')
    expect(glossaryRel('s')).toBe('produce/s/glossary.json')
    expect(auditRel('s')).toBe('produce/s/audit-report.md')
    expect(alignedRel('s')).toBe('produce/s/aligned.md')
    expect(metaRel('s')).toBe('produce/s/meta.json')
  })

  it('places the user input folder and the final artifact under input/ and output/ (D70)', () => {
    expect(inputDirRel()).toBe('input')
    expect(outputRel('s')).toBe('output/s.md')
  })

  it('derives a title from a file path, stripping one extension', () => {
    expect(titleFromPath('/ws/produce/三体.md')).toBe('三体')
    expect(titleFromPath('my.book.md')).toBe('my.book')
    expect(titleFromPath('noext')).toBe('noext')
    expect(titleFromPath('.hidden')).toBe('.hidden')
    expect(titleFromPath('')).toBe('')
  })
})
