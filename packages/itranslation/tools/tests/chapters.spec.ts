import { describe, expect, it } from 'vitest'
import { chapterTranslation, fragmentNumbers } from '../src/chapters'
import { MemFs } from './helpers'

describe('fragmentNumbers', () => {
  it('collects and sorts numeric fragments for a chapter', () => {
    expect(fragmentNumbers(['1.2.md', '1.1.md', '1.10.md', '2.1.md'], 1)).toEqual([1, 2, 10])
  })

  it('ignores the single-chapter file and non-numeric middles', () => {
    expect(fragmentNumbers(['1.md', '1.x.md', '3.1.md'], 1)).toEqual([])
  })

  it('returns empty for no matches', () => {
    expect(fragmentNumbers([], 1)).toEqual([])
  })
})

describe('chapterTranslation', () => {
  function io() {
    const mem = new MemFs()
    return { mem, io: { fs: mem.fs, cwd: '/workspace', signal: new AbortController().signal } }
  }

  it('reads the single chapter file when present', async () => {
    const { mem, io: fsio } = io()
    mem.seed('books/s/chapters/1.md', '第一段\n\n第二段')
    expect(await chapterTranslation(fsio, 's', 1)).toBe('第一段\n\n第二段')
  })

  it('joins sorted fragments when no single file exists', async () => {
    const { mem, io: fsio } = io()
    mem.seed('books/s/chapters/1.2.md', '第二片')
    mem.seed('books/s/chapters/1.1.md', '第一片')
    expect(await chapterTranslation(fsio, 's', 1)).toBe('第一片\n\n第二片')
  })

  it('throws when a chapter has no translation', async () => {
    const { io: fsio } = io()
    await expect(chapterTranslation(fsio, 's', 1)).rejects.toThrow(/译文缺失/)
  })
})
