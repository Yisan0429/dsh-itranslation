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
  metaRel,
  outputRel,
  sourceRel,
  stateRel,
  styleRel,
  titleFromPath,
} from '../src/paths'

describe('paths', () => {
  it('derives a slug from the title and prefixes the books directory', () => {
    expect(bookSlug('三体')).toBe('三体')
    expect(bookDirRel('三体')).toBe('books/三体')
  })

  it('builds every artifact path under the book directory', () => {
    expect(stateRel('s')).toBe('books/s/state.json')
    expect(sourceRel('s', 3)).toBe('books/s/source/3.md')
    expect(chaptersDirRel('s')).toBe('books/s/chapters')
    expect(chapterRel('s', 3)).toBe('books/s/chapters/3.md')
    expect(fragmentRel('s', 3, 2)).toBe('books/s/chapters/3.2.md')
    expect(glossaryRel('s')).toBe('books/s/glossary.json')
    expect(styleRel('s')).toBe('books/s/style.md')
    expect(auditRel('s')).toBe('books/s/audit-report.md')
    expect(alignedRel('s')).toBe('books/s/aligned.md')
    expect(metaRel('s')).toBe('books/s/meta.json')
    expect(outputRel('s')).toBe('books/s/s.md')
  })

  it('derives a title from a file path, stripping one extension', () => {
    expect(titleFromPath('/ws/books/三体.md')).toBe('三体')
    expect(titleFromPath('my.book.md')).toBe('my.book')
    expect(titleFromPath('noext')).toBe('noext')
    expect(titleFromPath('.hidden')).toBe('.hidden')
    expect(titleFromPath('')).toBe('')
  })
})
