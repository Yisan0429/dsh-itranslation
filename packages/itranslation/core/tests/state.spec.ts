import { describe, expect, it } from 'vitest'
import { createBookState } from '../src/index'

describe('createBookState', () => {
  it('builds chapter structure from ## headings without per-paragraph lists', () => {
    const state = createBookState('## 第一章 {#ch1}\n\n第一段。两个句子。\n\n第二段！\n\n## 第二章\n\n第三段？', '测试书')
    expect(state).toEqual({
      title: '测试书',
      chapters: [
        { index: 1, title: '第一章' },
        { index: 2, title: '第二章' },
      ],
    })
  })

  it('records the file-name title as-is and does not extract # headings', () => {
    const state = createBookState('# 书名\n\n正文。', '文件名.md')
    expect(state.title).toBe('文件名.md')
    expect(state.chapters).toEqual([
      { index: 1, title: '' },
    ])
  })

  it('builds a single empty-title chapter for markdown without ## headings', () => {
    const state = createBookState('只有正文。', '无标题书')
    expect(state.chapters).toEqual([
      { index: 1, title: '' },
    ])
  })
})
