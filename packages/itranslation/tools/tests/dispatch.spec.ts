import { describe, expect, it } from 'vitest'
import { DEFAULT_PROMPTS } from '@yisan0429/dsh-itranslation-core'
import { apply } from '../src/index'
import { captureCtx, fakeExec, fakeExecWithAgent, run, toolByName, type CapturedCtx } from './helpers'

/** Recorded calls against the fake subagents service. */
interface FakeSubagents {
  starts: Array<{
    provider: string
    label: string
    prompt: string
    parent: unknown
    toolFilter: { allow?: readonly string[] } | undefined
  }>
  followups: Array<{ childId: string; message: string; parent: unknown }>
  startContinuable: (spec: {
    provider: string
    label: string
    request: {
      label: string
      prompt: Array<{ type: string; text: string }>
      parent: unknown
      toolFilter?: { allow?: readonly string[] }
    }
    signal: AbortSignal
  }) => Promise<{ childId: string }>
  followup: (
    parent: unknown,
    childId: string,
    content: Array<{ type: string; text: string }>,
    options: unknown,
  ) => Promise<string>
}

/** The persisted child scope shape used by these tests. */
interface PersistedScope {
  slug?: string
  step?: string
  chapter?: number
  read?: string[]
  write?: string[]
}

function readScope(captured: CapturedCtx, childId = 'child-1'): PersistedScope {
  return JSON.parse(captured.mem.read(`produce/sample/.scopes/${childId}.json`) ?? '{}') as PersistedScope
}

function makeFake(): FakeSubagents {
  const fake: FakeSubagents = {
    starts: [],
    followups: [],
    startContinuable: async (spec) => {
      fake.starts.push({
        provider: spec.provider,
        label: spec.label,
        prompt: spec.request.prompt[0]?.text ?? '',
        parent: spec.request.parent,
        toolFilter: spec.request.toolFilter,
      })
      return { childId: 'child-1' }
    },
    followup: async (parent, childId, content, _options) => {
      fake.followups.push({ childId, message: content[0]?.text ?? '', parent })
      return 'message-1'
    },
  }
  return fake
}

describe('itranslation_dispatch', () => {
  async function dispatch(args: Record<string, unknown>) {
    const captured = captureCtx('/ws')
    const fake = makeFake()
    ;(captured.ctx as unknown as { get?: (name: string) => unknown }).get =
      (name: string) => name === 'subagents' ? fake : undefined
    apply(captured.ctx, {})
    captured.mem.seed('produce/sample/state.json', JSON.stringify({
      title: 'sample',
      inputPath: 'input/sample.md',
      chapters: [
        { index: 1, title: '' },
        { index: 2, title: 'The First Storm' },
        { index: 3, title: 'The Missing Oil' },
        { index: 4, title: 'The Long Night' },
      ],
    }))
    const result = await run(toolByName(captured, 'itranslation_dispatch'), args, fakeExec('/ws'))
    return { result, fake, captured }
  }

  it('pre-read: starts a subagent with the fixed prompt, a locked tool surface and a scope file', async () => {
    const { result, fake, captured } = await dispatch({ slug: 'sample', step: 'pre-read' })
    expect(result).toMatchObject({ ok: true, step: 'pre-read', subagentId: 'child-1' })
    expect(fake.starts).toHaveLength(1)
    const [start] = fake.starts
    expect(start?.provider).toBe('spawn')
    expect(start?.label).toBe('Pre-read: sample')
    expect(start?.prompt).toContain('目标语言：简体中文')
    expect(start?.prompt).toContain('输入：input/sample.md')
    expect(start?.prompt).toContain('produce/sample/glossary.json、produce/sample/analysis.md')
    expect(start?.prompt).toContain(DEFAULT_PROMPTS.preReadPrompt.replace('input/<file>.md', 'input/sample.md'))
    expect(start?.prompt).toContain('完成后只报告固定字段：产物路径（glossary.json/analysis.md）与术语表条目数')
    // Hard tool surface: only the scoped read/write plus the glossary tool.
    expect(start?.toolFilter?.allow).toEqual([
      'itranslation_scoped_read',
      'itranslation_scoped_write',
      'itranslation_glossary',
    ])
    // The child's access scope is persisted before the dispatch returns.
    const scope = readScope(captured)
    expect(scope.slug).toBe('sample')
    expect(scope.step).toBe('pre-read')
    expect(scope.read).toEqual(['/ws/input/sample.md'])
    expect(scope.write).toEqual(['/ws/produce/sample/glossary.json', '/ws/produce/sample/analysis.md'])
  })

  it('uses the settings targetLanguage when configured', async () => {
    const captured = captureCtx('/ws')
    const fake = makeFake()
    ;(captured.ctx as unknown as { get?: (name: string) => unknown }).get =
      (name: string) => name === 'subagents' ? fake
        : name === 'settings' ? { describe: () => [{ ns: 'itranslation', value: { targetLanguage: 'English', inputFile: 'input/book.md' } }] }
          : undefined
    apply(captured.ctx, {})
    captured.mem.seed('produce/sample/state.json', JSON.stringify({
      title: 'sample',
      inputPath: 'input/sample.md',
      chapters: [{ index: 1, title: '' }],
    }))
    await run(toolByName(captured, 'itranslation_dispatch'), { slug: 'sample', step: 'pre-read' }, fakeExec('/ws'))
    expect(fake.starts[0]?.prompt).toContain('目标语言：English')
  })

  it('uses a user-saved translate prompt from the settings page', async () => {
    const captured = captureCtx('/ws')
    const fake = makeFake()
    ;(captured.ctx as unknown as { get?: (name: string) => unknown }).get =
      (name: string) => name === 'subagents' ? fake
        : name === 'settings' ? {
          describe: () => [{
            ns: 'itranslation',
            value: { translatePrompt: '自定义翻译指令：逐字翻译', targetLanguage: '简体中文' },
          }],
        }
          : undefined
    apply(captured.ctx, {})
    captured.mem.seed('produce/sample/state.json', JSON.stringify({
      title: 'sample',
      inputPath: 'input/sample.md',
      chapters: [{ index: 1, title: '' }, { index: 2, title: 'Two' }],
    }))
    await run(toolByName(captured, 'itranslation_dispatch'), { slug: 'sample', step: 'translate', chapter: 2 }, fakeExec('/ws'))
    expect(fake.starts[0]?.prompt).toContain('自定义翻译指令：逐字翻译')
  })

  it('translate: starts one subagent per chapter with real paths and a per-chapter scope', async () => {
    const { fake, captured } = await dispatch({ slug: 'sample', step: 'translate', chapter: 2 })
    const [start] = fake.starts
    expect(start?.label).toBe('Translate chapter 2: sample')
    expect(start?.prompt).toContain('produce/sample/source/2.md')
    expect(start?.prompt).toContain('输出：produce/sample/chapters/2.md')
    expect(start?.prompt).toContain('逐块翻译')
    expect(start?.prompt).toContain('把译文写入 produce/sample/chapters/2.md')
    // Translate children get no glossary tool: read the three inputs, write one chapter.
    expect(start?.toolFilter?.allow).toEqual(['itranslation_scoped_read', 'itranslation_scoped_write'])
    const scope = readScope(captured)
    expect(scope.step).toBe('translate')
    expect(scope.chapter).toBe(2)
    expect(scope.read).toEqual([
      '/ws/produce/sample/analysis.md',
      '/ws/produce/sample/glossary.json',
      '/ws/produce/sample/source/2.md',
    ])
    expect(scope.write).toEqual(['/ws/produce/sample/chapters/2.md'])
  })

  it('translate: rejects a missing or unknown chapter', async () => {
    await expect(dispatch({ slug: 'sample', step: 'translate' })).rejects.toThrow(/chapter/)
    await expect(dispatch({ slug: 'sample', step: 'translate', chapter: 9 })).rejects.toThrow(/没有第 9 章/)
  })

  it('audit: starts a subagent listing every chapter pair with a revise-ready scope', async () => {
    const { fake, captured } = await dispatch({ slug: 'sample', step: 'audit' })
    const [start] = fake.starts
    expect(start?.label).toBe('Audit: sample')
    expect(start?.prompt).toContain('produce/sample/source/1.md、produce/sample/source/2.md、produce/sample/source/3.md、produce/sample/source/4.md')
    expect(start?.prompt).toContain('（对照 produce/sample/chapters/1.md、produce/sample/chapters/2.md、produce/sample/chapters/3.md、produce/sample/chapters/4.md）')
    expect(start?.prompt).toContain('输出：produce/sample/audit-report.md')
    expect(start?.prompt).toContain(DEFAULT_PROMPTS.auditPrompt)
    expect(start?.toolFilter?.allow).toEqual([
      'itranslation_scoped_read',
      'itranslation_scoped_write',
      'itranslation_glossary',
    ])
    // The audit child also carries the revise pass: it may rewrite chapters.
    const scope = readScope(captured)
    expect(scope.read).toEqual([
      '/ws/produce/sample/source/1.md', '/ws/produce/sample/chapters/1.md',
      '/ws/produce/sample/source/2.md', '/ws/produce/sample/chapters/2.md',
      '/ws/produce/sample/source/3.md', '/ws/produce/sample/chapters/3.md',
      '/ws/produce/sample/source/4.md', '/ws/produce/sample/chapters/4.md',
      '/ws/produce/sample/glossary.json', '/ws/produce/sample/analysis.md', '/ws/produce/sample/audit-report.md',
    ])
    expect(scope.write).toEqual([
      '/ws/produce/sample/audit-report.md',
      '/ws/produce/sample/chapters/1.md', '/ws/produce/sample/chapters/2.md',
      '/ws/produce/sample/chapters/3.md', '/ws/produce/sample/chapters/4.md',
    ])
  })

  it('revise: follows up the audit child with a "Revise: " message', async () => {
    const { result, fake } = await dispatch({ slug: 'sample', step: 'revise', childId: 'child-1' })
    expect(result).toMatchObject({ ok: true, step: 'revise', messageId: 'message-1' })
    expect(fake.starts).toHaveLength(0)
    expect(fake.followups).toHaveLength(1)
    const [followup] = fake.followups
    expect(followup?.childId).toBe('child-1')
    expect(followup?.message.startsWith('Revise: ')).toBe(true)
    expect(followup?.message).toContain(DEFAULT_PROMPTS.revisePrompt)
    expect(followup?.message).toContain('完成后只报告固定字段')
  })

  it('pre-read: rejects when state.json carries no inputPath; revise: rejects a missing childId', async () => {
    const captured = captureCtx('/ws')
    const fake = makeFake()
    ;(captured.ctx as unknown as { get?: (name: string) => unknown }).get =
      (name: string) => name === 'subagents' ? fake : undefined
    apply(captured.ctx, {})
    captured.mem.seed('produce/sample/state.json', JSON.stringify({ title: 'sample', chapters: [{ index: 1, title: '' }] }))
    await expect(
      run(toolByName(captured, 'itranslation_dispatch'), { slug: 'sample', step: 'pre-read' }, fakeExec('/ws')),
    ).rejects.toThrow(/inputPath/)
    await expect(dispatch({ slug: 'sample', step: 'revise' })).rejects.toThrow(/childId/)
  })

  it('rejects when the subagents service is unavailable', async () => {
    const captured = captureCtx('/ws')
    ;(captured.ctx as unknown as { get?: (name: string) => unknown }).get = () => undefined
    apply(captured.ctx, {})
    captured.mem.seed('produce/sample/state.json', JSON.stringify({ title: 'sample', chapters: [{ index: 1, title: '' }] }))
    await expect(
      run(toolByName(captured, 'itranslation_dispatch'), { slug: 'sample', step: 'pre-read', inputPath: 'input/sample.md' }, fakeExec('/ws')),
    ).rejects.toThrow(/subagents 服务不可用/)
  })

  it('renders both dispatch result shapes', () => {
    const captured = captureCtx('/ws')
    apply(captured.ctx, {})
    const definition = toolByName(captured, 'itranslation_dispatch')
    const started = definition.output.render(
      { slug: 'sample', step: 'pre-read' },
      { ok: true, step: 'pre-read', subagentId: 'child-1' },
    )
    expect(started).toEqual([{ type: 'text', text: 'started pre-read subagent child-1' }])
    const revised = definition.output.render(
      { slug: 'sample', step: 'revise', childId: 'child-1' },
      { ok: true, step: 'revise', messageId: 'message-1' },
    )
    expect(revised).toEqual([{ type: 'text', text: 'revise message message-1 queued for subagent child-1' }])
  })

  it('rejects when no calling agent is available', async () => {
    const captured = captureCtx('/ws')
    ;(captured.ctx as unknown as { get?: (name: string) => unknown }).get = () => undefined
    apply(captured.ctx, {})
    await expect(
      run(toolByName(captured, 'itranslation_dispatch'), { slug: 'sample', step: 'pre-read' }, fakeExecWithAgent(undefined)),
    ).rejects.toThrow(/requires a calling agent/)
  })

})

describe('itranslation_scoped_read / itranslation_scoped_write', () => {
  /** A captured ctx with a seeded translate-child scope for session child-1. */
  function scopedCtx(): CapturedCtx & { agent: unknown } {
    const captured = captureCtx('/ws')
    apply(captured.ctx, {})
    captured.mem.seed('produce/sample/state.json', JSON.stringify({ title: 'sample', chapters: [{ index: 1, title: '' }] }))
    captured.mem.seed('produce/sample/source/2.md', '原文段落')
    captured.mem.seed('produce/sample/.scopes/child-1.json', JSON.stringify({
      step: 'translate',
      slug: 'sample',
      chapter: 2,
      read: ['/ws/produce/sample/analysis.md', '/ws/produce/sample/glossary.json', '/ws/produce/sample/source/2.md'],
      write: ['/ws/produce/sample/chapters/2.md'],
    }))
    const agent = { session: { id: 'child-1', header: { cwd: '/ws' } } }
    return { ...captured, agent }
  }

  function childExec(agent: unknown) {
    return {
      callId: 'call-1' as never,
      rootCallId: 'call-1' as never,
      token: Symbol('token') as never,
      name: 'test',
      arguments: {},
      signal: new AbortController().signal,
      agent,
      deferContext() {},
      concludeTurn() {},
    } as never
  }

  it('reads an in-scope file and refuses an out-of-scope one', async () => {
    const captured = scopedCtx()
    captured.mem.seed('produce/sample/analysis.md', '档案内容')
    const read = toolByName(captured, 'itranslation_scoped_read')
    const ok = await run(read, { file_path: 'produce/sample/analysis.md' }, childExec(captured.agent))
    expect(ok).toMatchObject({ ok: true, path: '/ws/produce/sample/analysis.md', content: '档案内容' })
    // The whole book is NOT in the translate child's allowlist.
    captured.mem.seed('input/sample.md', '全书内容')
    await expect(
      run(read, { file_path: 'input/sample.md' }, childExec(captured.agent)),
    ).rejects.toThrow(/拒绝读取/)
    // Path traversal still resolves outside the allowlist.
    await expect(
      run(read, { file_path: 'produce/sample/../../input/sample.md' }, childExec(captured.agent)),
    ).rejects.toThrow(/拒绝读取/)
  })

  it('writes an in-scope file and refuses an out-of-scope one', async () => {
    const captured = scopedCtx()
    const write = toolByName(captured, 'itranslation_scoped_write')
    const ok = await run(write, { file_path: 'produce/sample/chapters/2.md', content: '译文段落' }, childExec(captured.agent))
    expect(ok).toMatchObject({ ok: true, path: '/ws/produce/sample/chapters/2.md' })
    expect(captured.mem.read('produce/sample/chapters/2.md')).toBe('译文段落')
    // Writing the glossary is outside this child's write list.
    await expect(
      run(write, { file_path: 'produce/sample/glossary.json', content: '{}' }, childExec(captured.agent)),
    ).rejects.toThrow(/拒绝写入/)
  })

  it('refuses any access when the session has no scope file', async () => {
    const captured = scopedCtx()
    captured.mem.seed('produce/sample/analysis.md', '档案内容')
    const read = toolByName(captured, 'itranslation_scoped_read')
    const orphan = { session: { id: 'no-scope-child', header: { cwd: '/ws' } } }
    await expect(
      run(read, { file_path: 'produce/sample/analysis.md' }, childExec(orphan)),
    ).rejects.toThrow(/未找到本子代理的文件访问范围/)
  })

  it('finds the scope in a multi-book produce directory despite a stray file like .gitkeep', async () => {
    // Regression: the lookup treated every `produce/` entry as a book slug and
    // died on the VCS placeholder (`produce/.gitkeep/.scopes/<id>.json` cannot
    // resolve because a parent segment is a file), so the pre-read child could
    // not read input/sample.md even though produce/sample/.scopes/<id>.json was
    // written correctly. Real book dirs are directories; the scan must skip
    // non-directory entries and still reach a book sorted later than them.
    const captured = captureCtx('/ws')
    apply(captured.ctx, {})
    captured.mem.seed('produce/.gitkeep', '')
    captured.mem.seed('produce/aaa/state.json', JSON.stringify({ title: 'aaa', chapters: [{ index: 1, title: '' }] }))
    captured.mem.seed('produce/zebra/state.json', JSON.stringify({ title: 'zebra', chapters: [{ index: 1, title: '' }] }))
    captured.mem.seed('produce/zebra/source/2.md', '原文段落')
    captured.mem.seed('produce/zebra/.scopes/child-1.json', JSON.stringify({
      step: 'translate',
      slug: 'zebra',
      chapter: 2,
      read: ['/ws/produce/zebra/source/2.md'],
      write: ['/ws/produce/zebra/chapters/2.md'],
    }))
    const read = toolByName(captured, 'itranslation_scoped_read')
    const agent = { session: { id: 'child-1', header: { cwd: '/ws' } } }
    const ok = await run(read, { file_path: 'produce/zebra/source/2.md' }, childExec(agent))
    expect(ok).toMatchObject({ ok: true, path: '/ws/produce/zebra/source/2.md' })
  })

  it('glossary: a scoped child is pinned to its own book', async () => {
    const captured = scopedCtx()
    captured.mem.seed('produce/sample/glossary.json', JSON.stringify({ entries: [] }))
    const glossary = toolByName(captured, 'itranslation_glossary')
    const other = { session: { id: 'child-1', header: { cwd: '/ws' } } }
    await expect(
      run(glossary, { slug: 'other-book', set: [{ term: 'x', translation: 'y' }] }, childExec(other)),
    ).rejects.toThrow(/只能操作书目「sample」/)
    const own = await run(glossary, { slug: 'sample', set: [{ term: 'keeper', translation: '守灯人' }] }, childExec(other))
    expect(own).toMatchObject({ slug: 'sample' })
  })

  it('renders scoped read/write results', () => {
    const captured = captureCtx('/ws')
    apply(captured.ctx, {})
    const read = toolByName(captured, 'itranslation_scoped_read')
    expect(read.output.render({}, { ok: false, path: 'x', content: '' })).toEqual([{ type: 'text', text: '读取被拒绝' }])
    expect(read.output.render({}, { ok: true, path: '/p', content: 'c' })).toEqual([{ type: 'text', text: '== /p ==\nc' }])
    const write = toolByName(captured, 'itranslation_scoped_write')
    expect(write.output.render({}, { ok: false, path: 'x' })).toEqual([{ type: 'text', text: '写入被拒绝' }])
    expect(write.output.render({}, { ok: true, path: '/p' })).toEqual([{ type: 'text', text: '已写入 /p' }])
  })

  it('rejects read/write when the calling session has no id', async () => {
    const captured = scopedCtx()
    const noId = { session: { header: { cwd: '/ws' } } }
    await expect(
      run(toolByName(captured, 'itranslation_scoped_read'), { file_path: 'produce/sample/analysis.md' }, childExec(noId)),
    ).rejects.toThrow(/只能在子代理会话中调用/)
    await expect(
      run(toolByName(captured, 'itranslation_scoped_write'), { file_path: 'produce/sample/chapters/2.md', content: 'x' }, childExec(noId)),
    ).rejects.toThrow(/只能在子代理会话中调用/)
  })

  it('refuses write when the session has no scope file', async () => {
    const captured = scopedCtx()
    const write = toolByName(captured, 'itranslation_scoped_write')
    const orphan = { session: { id: 'no-scope-child', header: { cwd: '/ws' } } }
    await expect(
      run(write, { file_path: 'produce/sample/chapters/2.md', content: 'x' }, childExec(orphan)),
    ).rejects.toThrow(/未找到本子代理的文件访问范围/)
  })

})
