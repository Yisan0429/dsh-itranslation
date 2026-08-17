import { describe, expect, it } from 'vitest'
import { detectChapters, normalizeMarkdown, stripHeadingAttributes } from '../src/index'

describe('stripHeadingAttributes', () => {
  it('strips a trailing heading attribute', () => {
    expect(stripHeadingAttributes('第一章 开始 {#第一章-开始}')).toBe('第一章 开始')
  })

  it('keeps a title without attributes unchanged', () => {
    expect(stripHeadingAttributes('第一章 开始')).toBe('第一章 开始')
  })

  it('trims trailing whitespace around the attribute', () => {
    expect(stripHeadingAttributes('第一章 开始   {#x}   ')).toBe('第一章 开始')
  })
})

describe('normalizeMarkdown', () => {
  it('strips a BOM and unifies line endings', () => {
    expect(normalizeMarkdown('\uFEFF# 标题\r\n\r\n正文\r第二行')).toBe('# 标题\n\n正文\n第二行')
  })

  it('drops trailing whitespace and trims outer blank lines', () => {
    expect(normalizeMarkdown('\n  # 标题  \n\n正文  \n')).toBe('# 标题\n\n正文')
  })
})

describe('detectChapters', () => {
  it('returns a single empty-title chapter for markdown without ## headings', () => {
    const chapters = detectChapters('只有正文。\n\n第二段。')
    expect(chapters).toEqual([
      { index: 1, title: '', body: '只有正文。\n\n第二段。' },
    ])
  })

  it('returns a single empty chapter for an empty markdown string', () => {
    expect(detectChapters('')).toEqual([
      { index: 1, title: '', body: '' },
    ])
  })

  it('splits chapters on ## headings and strips attributes', () => {
    const markdown = '# 三体\n\n## 第一章 开始 {#ch1}\n\n第一段。\n\n## 第二章 继续\n\n第二段。'
    expect(detectChapters(markdown)).toEqual([
      { index: 1, title: '', body: '# 三体' },
      { index: 2, title: '第一章 开始', body: '第一段。' },
      { index: 3, title: '第二章 继续', body: '第二段。' },
    ])
  })

  it('makes content before the first ## heading its own empty-title chapter', () => {
    const markdown = '# 三体\n\n序言正文。\n\n## 第一章\n\n正文。'
    expect(detectChapters(markdown)).toEqual([
      { index: 1, title: '', body: '# 三体\n\n序言正文。' },
      { index: 2, title: '第一章', body: '正文。' },
    ])
  })

  it('keeps ### section headings inside the chapter body', () => {
    const markdown = '## 第一章\n\n### 1.1 节\n\n正文'
    expect(detectChapters(markdown)).toEqual([
      { index: 1, title: '第一章', body: '### 1.1 节\n\n正文' },
    ])
  })

  it('treats # and #正文 lines as ordinary body text', () => {
    const markdown = '# 书名\n\n#正文不是标题\n\n## 第一章\n\n第二段'
    expect(detectChapters(markdown)).toEqual([
      { index: 1, title: '', body: '# 书名\n\n#正文不是标题' },
      { index: 2, title: '第一章', body: '第二段' },
    ])
  })

  it('keeps internal blank lines in chapter bodies', () => {
    const markdown = '## 第一章\n\n第一段。\n\n第二段。'
    expect(detectChapters(markdown)).toEqual([
      { index: 1, title: '第一章', body: '第一段。\n\n第二段。' },
    ])
  })
})
