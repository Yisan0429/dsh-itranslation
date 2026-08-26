import { describe, expect, it } from 'vitest'
import { assembleBook, assembleChapter, createBookState, joinChapterFragments, TranslationMismatchError } from '../src/index'
import type { ChapterState } from '../src/index'

function chapterState(overrides: Partial<ChapterState> = {}): ChapterState {
  return {
    index: 1,
    title: '第一章',
    ...overrides,
  }
}

const SOURCE = '第一段。两个句子。\n\n第二段！'

describe('joinChapterFragments', () => {
  it('joins fragments with blank lines and ignores blanks', () => {
    expect(joinChapterFragments(['第一段。', '', '第二段。', '   '])).toBe('第一段。\n\n第二段。')
  })

  it('returns an empty string for an empty list or only blank fragments', () => {
    expect(joinChapterFragments([])).toBe('')
    expect(joinChapterFragments(['', '   '])).toBe('')
  })
})

describe('assembleChapter', () => {
  it('emits the ## heading and translated paragraphs in order', () => {
    expect(assembleChapter(chapterState(), SOURCE, '第一段译文。\n\n第二段译文！')).toBe(
      '## 第一章\n\n第一段译文。\n\n第二段译文！',
    )
  })

  it('emits no heading when the chapter title is empty', () => {
    expect(assembleChapter(chapterState({ title: '' }), SOURCE, '第一段译文。\n\n第二段译文！')).toBe(
      '第一段译文。\n\n第二段译文！',
    )
  })

  it('does not enforce sentence counts', () => {
    expect(assembleChapter(chapterState(), SOURCE, '一句。\n\n另一句。')).toBe(
      '## 第一章\n\n一句。\n\n另一句。',
    )
  })

  it('throws on paragraph count mismatch', () => {
    try {
      assembleChapter(chapterState(), SOURCE, '只有一段。')
      expect.unreachable()
    } catch (error) {
      const mismatch = error as TranslationMismatchError
      expect(mismatch.kind).toBe('paragraph-count')
      expect(mismatch.chapterIndex).toBe(1)
      expect(mismatch.expected).toBe(2)
      expect(mismatch.actual).toBe(1)
      expect(mismatch.message).toBe('第 1 章段落数失配：原文 2 段，译文 1 段')
    }
  })

  it('throws when the translation has no paragraphs', () => {
    try {
      assembleChapter(chapterState(), SOURCE, '')
      expect.unreachable()
    } catch (error) {
      const mismatch = error as TranslationMismatchError
      expect(mismatch.kind).toBe('paragraph-count')
      expect(mismatch.actual).toBe(0)
    }
  })
})

describe('assembleBook', () => {
  const state = createBookState('## 第一章\n\n第一段。两个句子。\n\n第二段！\n\n## 第二章\n\n第三段？', '测试书')

  it('emits # book title line and ## chapters in state order', () => {
    const markdown = assembleBook(state, [
      '第一段。两个句子。\n\n第二段！',
      '第三段？',
    ], [
      '第一章第一段译文。\n\n第一章第二段译文！',
      '第二章第一段译文？',
    ])
    expect(markdown).toBe(
      '# 测试书\n\n## 第一章\n\n第一章第一段译文。\n\n第一章第二段译文！\n\n## 第二章\n\n第二章第一段译文？',
    )
  })

  it('emits an empty # line when the book title is empty', () => {
    const emptyTitleState = createBookState('## 第一章\n\n第一段。', '')
    const markdown = assembleBook(emptyTitleState, ['第一段。'], ['第一章译文。'])
    expect(markdown).toBe('# \n\n## 第一章\n\n第一章译文。')
  })

  it('throws on chapter count mismatch between state and translations', () => {
    try {
      assembleBook(state, ['第一段。', '第二段。'], [])
      expect.unreachable()
    } catch (error) {
      const mismatch = error as TranslationMismatchError
      expect(mismatch.kind).toBe('chapter-count')
      expect(mismatch.chapterIndex).toBe(1)
      expect(mismatch.expected).toBe(2)
      expect(mismatch.actual).toBe(0)
      expect(mismatch.message).toBe('章数失配：清单 2 章，译文 0 章')
    }
  })

  it('throws on chapter count mismatch between sources and translations', () => {
    try {
      assembleBook(state, ['第一段。'], ['第一章译文。'])
      expect.unreachable()
    } catch (error) {
      const mismatch = error as TranslationMismatchError
      expect(mismatch.kind).toBe('chapter-count')
      expect(mismatch.expected).toBe(2)
      expect(mismatch.actual).toBe(1)
    }
  })

  it('propagates paragraph mismatch errors from a chapter', () => {
    expect(() =>
      assembleBook(
        state,
        ['第一段。两个句子。\n\n第二段！', '第三段？'],
        ['只有一段。', '第二章译文。'],
      ),
    ).toThrow(TranslationMismatchError)
  })
})

describe('assemble with title translations', () => {
  const titles = new Map([
    ['测试书', '译名书'],
    ['第一章', '译名第一章'],
    ['第二章', '译名第二章'],
  ])

  it('translates the ## heading of a chapter through the map', () => {
    expect(assembleChapter(chapterState(), SOURCE, '第一段译文。\n\n第二段译文！', titles)).toBe(
      '## 译名第一章\n\n第一段译文。\n\n第二段译文！',
    )
  })

  it('translates the # book title and ## chapter headings in assembleBook', () => {
    const bookState = createBookState('## 第一章\n\n第一段。\n\n## 第二章\n\n第三段。', '测试书')
    const markdown = assembleBook(
      bookState,
      ['第一段。', '第三段。'],
      ['第一章译文。', '第二章译文。'],
      titles,
    )
    expect(markdown).toBe('# 译名书\n\n## 译名第一章\n\n第一章译文。\n\n## 译名第二章\n\n第二章译文。')
  })

  it('keeps raw titles when the map carries no entry', () => {
    expect(assembleChapter(chapterState(), SOURCE, '第一段译文。\n\n第二段译文！', new Map())).toBe(
      '## 第一章\n\n第一段译文。\n\n第二段译文！',
    )
  })

  it('drops the title-as-body paragraph of the empty-title first chapter', () => {
    // Source chapter 1 body = the `# <book title>` line plus an intro; its
    // translation mirrors that. Assembly must emit the book-title line once.
    const bookState = createBookState(
      '# 测试书\n\n简介。\n\n## 第一章\n\n第一段。',
      '测试书',
    )
    const markdown = assembleBook(
      bookState,
      ['# 测试书\n\n简介。', '第一段。'],
      ['# 译名书\n\n译文简介。', '第一章译文。'],
      titles,
    )
    expect(markdown).toBe('# 译名书\n\n译文简介。\n\n## 译名第一章\n\n第一章译文。')
  })

  it('does not drop the first paragraph when it is not the book-title line', () => {
    const bookState = createBookState('# 测试书\n\n简介。\n\n## 第一章\n\n第一段。', '测试书')
    const markdown = assembleBook(
      bookState,
      ['简介。\n\n附注。', '第一段。'],
      ['译文简介。\n\n译文附注。', '第一章译文。'],
      titles,
    )
    expect(markdown).toBe('# 译名书\n\n译文简介。\n\n译文附注。\n\n## 译名第一章\n\n第一章译文。')
  })
})
