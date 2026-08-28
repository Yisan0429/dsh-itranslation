import { describe, expect, it } from 'vitest'
import { engineVersion } from '@yisan0429/dsh-itranslation-core'
import { apply } from '../src/index'
import type { MetaFile } from '../src/types'
import { captureCtx, fakeExec, run, toolByName, type CapturedCtx } from './helpers'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

const MARKDOWN = '## 第一章\n\n第一段。\n\n第二段。\n\n## 第二章\n\n第三段。\n'
const SLUG = '测试书'

/** Register all tools and return the capture context plus a default exec. */
function setup(cwd = '/ws'): { captured: CapturedCtx; exec: ToolRunContext } {
  const captured = captureCtx(cwd)
  apply(captured.ctx, {})
  return { captured, exec: fakeExec(cwd) }
}

/** Prepare a two-chapter book through the real `itranslation_prepare` tool. */
async function prepareBook(captured: CapturedCtx, exec: ToolRunContext): Promise<unknown> {
  captured.mem.seed('book.md', MARKDOWN)
  return run(toolByName(captured, 'itranslation_prepare'), { path: 'book.md', title: SLUG }, exec)
}

describe('itranslation_prepare', () => {
  it('writes source backups and state.json, returning the book structure', async () => {
    const { captured, exec } = setup()
    const result = await prepareBook(captured, exec)

    expect(result).toEqual({
      slug: SLUG,
      bookDir: `produce/${SLUG}`,
      title: SLUG,
      chapters: [{ index: 1, title: '第一章' }, { index: 2, title: '第二章' }],
      sourceFiles: [`produce/${SLUG}/source/1.md`, `produce/${SLUG}/source/2.md`],
    })
    expect(captured.mem.read(`produce/${SLUG}/source/1.md`)).toBe('第一段。\n\n第二段。')
    expect(captured.mem.read(`produce/${SLUG}/source/2.md`)).toBe('第三段。')
    expect(JSON.parse(captured.mem.read(`produce/${SLUG}/state.json`) ?? '')).toEqual({
      title: SLUG,
      chapters: [{ index: 1, title: '第一章' }, { index: 2, title: '第二章' }],
      inputPath: 'book.md',
    })
  })

  it('derives the title from the file name when omitted', async () => {
    const { captured, exec } = setup()
    captured.mem.seed('三体.md', MARKDOWN)
    const result = await run(toolByName(captured, 'itranslation_prepare'), { path: '三体.md' }, exec)
    expect(result).toMatchObject({ title: '三体', slug: '三体' })
  })

  it('auto-discovers the single Markdown under input/ when path is omitted', async () => {
    const { captured, exec } = setup()
    captured.mem.seed('input/only.md', MARKDOWN)
    const result = await run(toolByName(captured, 'itranslation_prepare'), {}, exec)
    expect(result).toMatchObject({ title: 'only', slug: 'only' })
    expect(captured.mem.read('produce/only/source/1.md')).toBe('第一段。\n\n第二段。')
  })

  it('prefers the settings inputFile over auto-discovery', async () => {
    const { captured, exec } = setup()
    ;(captured.ctx as unknown as { get?: (name: string) => unknown }).get =
      (name: string) => name === 'settings' ? {
        describe: () => [{ ns: 'itranslation', value: { targetLanguage: 'English', inputFile: 'input/picked.md' } }],
      } : undefined
    captured.mem.seed('input/picked.md', MARKDOWN)
    captured.mem.seed('input/other.md', MARKDOWN)
    const result = await run(toolByName(captured, 'itranslation_prepare'), {}, exec)
    expect(result).toMatchObject({ title: 'picked', slug: 'picked' })
  })

  it('rejects auto-discovery with no or several Markdown candidates under input/', async () => {
    const { captured, exec } = setup()
    await expect(run(toolByName(captured, 'itranslation_prepare'), {}, exec)).rejects.toThrow(/没有 Markdown/)
    captured.mem.seed('input/a.md', MARKDOWN)
    captured.mem.seed('input/b.md', MARKDOWN)
    await expect(run(toolByName(captured, 'itranslation_prepare'), {}, exec)).rejects.toThrow(/多个候选/)
  })

  it('refuses to overwrite an already-prepared book', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    await expect(run(toolByName(captured, 'itranslation_prepare'), { path: 'book.md', title: SLUG }, exec))
      .rejects.toThrow(/已准备过/)
  })

  it('rejects an empty derived title', async () => {
    const { captured, exec } = setup()
    captured.mem.seed('input/x.md', MARKDOWN)
    await expect(run(toolByName(captured, 'itranslation_prepare'), { title: '' }, exec)).rejects.toThrow(/书名缺失/)
  })
})

describe('itranslation_segment', () => {
  it('reports per-chapter paragraph/sentence/byte counts', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    const result = await run(toolByName(captured, 'itranslation_segment'), { slug: SLUG }, exec)

    expect(result).toMatchObject({
      slug: SLUG,
      overlongChapters: [],
      chapters: [
        { index: 1, title: '第一章', paragraphs: 2, sentences: 2, overlong: false },
        { index: 2, title: '第二章', paragraphs: 1, sentences: 1, overlong: false },
      ],
    })
  })

  it('restricts to a single chapter and rejects an unknown one', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    const single = await run(toolByName(captured, 'itranslation_segment'), { slug: SLUG, chapter: 2 }, exec)
    expect(single).toMatchObject({ chapters: [{ index: 2, title: '第二章' }] })

    await expect(run(toolByName(captured, 'itranslation_segment'), { slug: SLUG, chapter: 9 }, exec))
      .rejects.toThrow(/第 9 章不存在/)
  })

  it('flags over-long chapters against the configured threshold', async () => {
    const captured = captureCtx()
    apply(captured.ctx, { overlongThresholdBytes: 8 })
    const exec = fakeExec()
    await prepareBook(captured, exec)
    const result = await run(toolByName(captured, 'itranslation_segment'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ overlongChapters: [1, 2] })
  })
})

describe('itranslation_glossary', () => {
  async function prepared(captured: CapturedCtx, exec: ToolRunContext): Promise<void> {
    await prepareBook(captured, exec)
  }

  it('upserts entries and writes glossary.json', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    const result = await run(
      toolByName(captured, 'itranslation_glossary'),
      { slug: SLUG, set: [{ term: 'user', translation: '用户' }], source: 'manual' },
      exec,
    )
    expect(result).toMatchObject({ slug: SLUG, entries: [{ term: 'user', translation: '用户', source: 'manual' }] })
    expect(JSON.parse(captured.mem.read(`produce/${SLUG}/glossary.json`) ?? '')).toEqual({
      entries: [{ term: 'user', translation: '用户', source: 'manual' }],
    })
  })

  it('removes entries and reads back the current table when unchanged', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    await run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG, set: [{ term: 'a', translation: '甲' }] }, exec)
    const removed = await run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG, remove: ['a'] }, exec)
    expect(removed).toMatchObject({ entries: [] })

    await run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG, set: [{ term: 'b', translation: '乙' }] }, exec)
    const read = await run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG }, exec)
    expect(read).toMatchObject({ entries: [{ term: 'b', translation: '乙' }] })
  })

  it('preserves note and source through a round-trip', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    await run(
      toolByName(captured, 'itranslation_glossary'),
      { slug: SLUG, set: [{ term: 'user', translation: '用户', note: '登录场景' }], source: 'manual' },
      exec,
    )
    const read = await run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG }, exec)
    expect(read).toMatchObject({ entries: [{ term: 'user', translation: '用户', note: '登录场景', source: 'manual' }] })
  })

  it('drops an empty note', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    const result = await run(
      toolByName(captured, 'itranslation_glossary'),
      { slug: SLUG, set: [{ term: 'a', translation: '乙', note: '' }] },
      exec,
    )
    expect(result).toMatchObject({ entries: [{ term: 'a', translation: '乙', source: 'manual' }] })
  })

  it('overwrites an existing term on re-set', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    await run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG, set: [{ term: 'a', translation: '甲' }] }, exec)
    const result = await run(
      toolByName(captured, 'itranslation_glossary'),
      { slug: SLUG, set: [{ term: 'a', translation: '甲二' }] },
      exec,
    )
    expect(result).toMatchObject({ entries: [{ term: 'a', translation: '甲二' }] })
  })

  it('reads a hand-written glossary.json without note/source', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    captured.mem.seed(`produce/${SLUG}/glossary.json`, '{"entries":[{"term":"x","translation":"y"}]}')
    const read = await run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG }, exec)
    expect(read).toMatchObject({ entries: [{ term: 'x', translation: 'y' }] })
  })

  it('warns softly when a single set exceeds the soft threshold', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    const bigSet = Array.from({ length: 101 }, (_, index) => ({ term: `t${index}`, translation: `译${index}` }))
    const result = await run(
      toolByName(captured, 'itranslation_glossary'),
      { slug: SLUG, set: bigSet },
      exec,
    ) as { warnings?: string[] }
    expect(result.warnings).toBeDefined()
    expect((result.warnings as string[])[0]).toContain('软阈值')
  })

  it('does not warn for a normal-size set', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    const result = await run(
      toolByName(captured, 'itranslation_glossary'),
      { slug: SLUG, set: [{ term: 'a', translation: '甲' }] },
      exec,
    ) as { warnings?: string[] }
    expect(result.warnings).toBeUndefined()
  })

  it('refuses to write a glossary beyond the hard cap', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    const hugeSet = Array.from({ length: 201 }, (_, index) => ({ term: `t${index}`, translation: `译${index}` }))
    await expect(
      run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG, set: hugeSet }, exec),
    ).rejects.toThrow(/上限 200/)
    expect(captured.mem.read(`produce/${SLUG}/glossary.json`)).toBeUndefined()
  })

  it('rejects an entry with an empty term', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    await expect(
      run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG, set: [{ term: '', translation: 'x' }] }, exec),
    ).rejects.toThrow(/term 不能为空/)
  })

  it('rejects an entry with an empty translation', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    await expect(
      run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG, set: [{ term: 'a', translation: '' }] }, exec),
    ).rejects.toThrow(/translation 不能为空/)
  })

  it('rejects a malformed glossary.json', async () => {
    const { captured, exec } = setup()
    await prepared(captured, exec)
    const cases: Array<[string, RegExp]> = [
      ['"str"', /应为 \{ entries \} 对象/],
      ['null', /应为 \{ entries \} 对象/],
      ['[1,2]', /应为 \{ entries \} 对象/],
      ['{}', /entries 缺失或非数组/],
      ['{"entries":1}', /entries 缺失或非数组/],
      ['{"entries":[1]}', /第 1 条应为对象/],
      ['{"entries":[{}]}', /term 缺失或非字符串/],
      ['{"entries":[{"term":""}]}', /term 缺失或非字符串/],
      ['{"entries":[{"term":"a"}]}', /translation 缺失或非字符串/],
    ]
    for (const [content, message] of cases) {
      captured.mem.seed(`produce/${SLUG}/glossary.json`, content)
      await expect(run(toolByName(captured, 'itranslation_glossary'), { slug: SLUG }, exec)).rejects.toThrow(message)
    }
  })
})

describe('itranslation_align', () => {
  async function withChapters(captured: CapturedCtx, exec: ToolRunContext, files: Record<string, string>): Promise<void> {
    await prepareBook(captured, exec)
    for (const [file, content] of Object.entries(files)) captured.mem.seed(`produce/${SLUG}/chapters/${file}`, content)
  }

  it('assembles aligned chapters and writes aligned.md', async () => {
    const { captured, exec } = setup()
    await withChapters(captured, exec, {
      '1.md': '译一段。\n\n译二段。',
      '2.md': '译三段。',
    })
    const result = await run(toolByName(captured, 'itranslation_align'), { slug: SLUG }, exec)
    expect(result).toMatchObject({
      ok: true,
      slug: SLUG,
      alignedFile: `produce/${SLUG}/aligned.md`,
      chapters: [
        { index: 1, title: '第一章', sourceParagraphs: 2, translationParagraphs: 2 },
        { index: 2, title: '第二章', sourceParagraphs: 1, translationParagraphs: 1 },
      ],
    })
    expect(captured.mem.read(`produce/${SLUG}/aligned.md`)).toContain('## 第一章')
  })

  it('joins over-long chapter fragments', async () => {
    const { captured, exec } = setup()
    await withChapters(captured, exec, { '1.1.md': '译一段。', '1.2.md': '译二段。', '2.md': '译三段。' })
    const result = await run(toolByName(captured, 'itranslation_align'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ ok: true })
  })

  it('translates headings from glossary.json during alignment', async () => {
    const { captured, exec } = setup()
    await withChapters(captured, exec, { '1.md': '译一段。\n\n译二段。', '2.md': '译三段。' })
    captured.mem.seed(`produce/${SLUG}/glossary.json`, JSON.stringify({
      entries: [{ term: '第一章', translation: '首章' }],
    }))
    const result = await run(toolByName(captured, 'itranslation_align'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ ok: true })
    expect(captured.mem.read(`produce/${SLUG}/aligned.md`)).toContain('## 首章')
  })


  it('returns a structured mismatch when paragraph counts differ', async () => {
    const { captured, exec } = setup()
    await withChapters(captured, exec, { '1.md': '只有一段。', '2.md': '译三段。' })
    const result = await run(toolByName(captured, 'itranslation_align'), { slug: SLUG }, exec)
    expect(result).toMatchObject({
      ok: false,
      mismatch: { kind: 'paragraph-count', chapterIndex: 1, expected: 2, actual: 1 },
    })
  })

  it('throws when a chapter translation is missing', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    await expect(run(toolByName(captured, 'itranslation_align'), { slug: SLUG }, exec)).rejects.toThrow(/译文缺失/)
  })
})

describe('itranslation_assemble', () => {
  async function ready(captured: CapturedCtx, exec: ToolRunContext): Promise<void> {
    await prepareBook(captured, exec)
    captured.mem.seed(`produce/${SLUG}/chapters/1.md`, '译一段。\n\n译二段。')
    captured.mem.seed(`produce/${SLUG}/chapters/2.md`, '译三段。')
  }

  it('requires the audit report before assembling', async () => {
    const { captured, exec } = setup()
    await ready(captured, exec)
    await expect(run(toolByName(captured, 'itranslation_assemble'), { slug: SLUG }, exec)).rejects.toThrow(/审查报告缺失/)
  })

  it('writes the final Markdown and meta.json evidence chain', async () => {
    const { captured, exec } = setup()
    await ready(captured, exec)
    captured.mem.seed(`produce/${SLUG}/audit-report.md`, '# 审查报告\n')
    const result = await run(
      toolByName(captured, 'itranslation_assemble'),
      { slug: SLUG, processes: [{ step: 'translate', model: 'default' }] },
      exec,
    )

    expect(result).toMatchObject({
      ok: true,
      slug: SLUG,
      outputFile: `output/${SLUG}.md`,
      metaFile: `produce/${SLUG}/meta.json`,
      chapterCount: 2,
    })
    expect(captured.mem.read(`output/${SLUG}.md`)).toContain(`# ${SLUG}`)

    const meta = JSON.parse(captured.mem.read(`produce/${SLUG}/meta.json`) ?? '') as MetaFile
    expect(meta).toMatchObject({
      schemaVersion: 1,
      engineVersion,
      title: SLUG,
      slug: SLUG,
      bookDir: `produce/${SLUG}`,
      outputFile: `output/${SLUG}.md`,
      chapters: [
        { index: 1, title: '第一章', paragraphs: 2 },
        { index: 2, title: '第二章', paragraphs: 1 },
      ],
      processes: [{ step: 'translate', model: 'default' }],
    })
    expect(meta.assembledAt).toBeTypeOf('string')
  })

  it('merges supplied notes when the session log is available', async () => {
    const { captured } = setup()
    const exec = {
      ...fakeExec('/ws'),
      agent: { session: { header: { cwd: '/ws' }, events: [] } },
    } as unknown as ToolRunContext
    await ready(captured, exec)
    captured.mem.seed(`produce/${SLUG}/audit-report.md`, '# 审查报告\n')
    const result = await run(
      toolByName(captured, 'itranslation_assemble'),
      { slug: SLUG, processes: [{ step: 'translate', notes: '第 1–2 章并行' }] },
      exec,
    )
    expect(result).toMatchObject({ ok: true })
    const meta = JSON.parse(captured.mem.read(`produce/${SLUG}/meta.json`) ?? '') as MetaFile
    expect(meta.processes).toEqual([{ step: 'translate', notes: '第 1–2 章并行' }])
  })


  it('returns a structured mismatch on paragraph-count failure', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    captured.mem.seed(`produce/${SLUG}/chapters/1.md`, '只有一段。')
    captured.mem.seed(`produce/${SLUG}/chapters/2.md`, '译三段。')
    captured.mem.seed(`produce/${SLUG}/audit-report.md`, '# 审查报告\n')
    const result = await run(toolByName(captured, 'itranslation_assemble'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ ok: false, mismatch: { kind: 'paragraph-count', chapterIndex: 1 } })
  })
})

describe('itranslation_status', () => {
  it('reports none when the book directory is absent', async () => {
    const { captured, exec } = setup()
    const result = await run(toolByName(captured, 'itranslation_status'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ exists: false, phase: 'none', totalChapters: 0 })
  })

  it('reports prepared after prepare', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    const result = await run(toolByName(captured, 'itranslation_status'), { slug: SLUG }, exec)
    expect(result).toMatchObject({
      exists: true,
      totalChapters: 2,
      sourceChapters: 2,
      translatedChapters: 0,
      phase: 'prepared',
      artifacts: { state: true, glossary: false, meta: false, output: false },
    })
  })

  it('reports none when the directory exists but nothing is prepared', async () => {
    const { captured, exec } = setup()
    captured.mem.seed(`produce/${SLUG}/.keep`, '')
    const result = await run(toolByName(captured, 'itranslation_status'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ exists: true, phase: 'none', totalChapters: 0, translatedChapters: 0 })
  })

  it('counts fragment-only chapters as translated', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    captured.mem.seed(`produce/${SLUG}/chapters/1.1.md`, '译一段。')
    captured.mem.seed(`produce/${SLUG}/chapters/1.2.md`, '译二段。')
    const result = await run(toolByName(captured, 'itranslation_status'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ translatedChapters: 1, phase: 'translating' })
  })

  it('reports aligned when aligned.md exists', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    captured.mem.seed(`produce/${SLUG}/chapters/1.md`, '译一段。\n\n译二段。')
    captured.mem.seed(`produce/${SLUG}/chapters/2.md`, '译三段。')
    captured.mem.seed(`produce/${SLUG}/aligned.md`, '# 测试书\n')
    const result = await run(toolByName(captured, 'itranslation_status'), { slug: SLUG }, exec)
    expect(result).toMatchObject({ phase: 'aligned' })
  })

  it('reports translating/assembled as artifacts appear', async () => {
    const { captured, exec } = setup()
    await prepareBook(captured, exec)
    captured.mem.seed(`produce/${SLUG}/chapters/1.md`, '译一段。\n\n译二段。')
    captured.mem.seed(`produce/${SLUG}/chapters/2.md`, '译三段。')
    captured.mem.seed(`produce/${SLUG}/audit-report.md`, '# 审查报告\n')

    const translating = await run(toolByName(captured, 'itranslation_status'), { slug: SLUG }, exec)
    expect(translating).toMatchObject({ translatedChapters: 2, phase: 'audited' })

    await run(toolByName(captured, 'itranslation_assemble'), { slug: SLUG }, exec)
    const assembled = await run(toolByName(captured, 'itranslation_status'), { slug: SLUG }, exec)
    expect(assembled).toMatchObject({ phase: 'assembled', artifacts: { meta: true, output: true } })
  })
})
