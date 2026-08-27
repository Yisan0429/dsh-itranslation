import { describe, expect, it } from 'vitest'
import { captureCtx, fakeExec } from './helpers'
import { toolFs } from '../src/io'
import {
  delay,
  findScopeForSession,
  parseScope,
  scopeFileRel,
  scopesDirRel,
} from '../src/scope'

describe('parseScope', () => {
  it('rejects non-object payloads', () => {
    expect(() => parseScope(null)).toThrow(/应为对象/)
    expect(() => parseScope([])).toThrow(/应为对象/)
    expect(() => parseScope('x')).toThrow(/应为对象/)
  })

  it('rejects invalid step, slug, read, and write fields', () => {
    expect(() => parseScope({ step: 'bogus', slug: 's', read: [], write: [] })).toThrow(/step 非法/)
    expect(() => parseScope({ step: 'translate', slug: '', read: [], write: [] })).toThrow(/slug 缺失/)
    expect(() => parseScope({ step: 'translate', slug: 's', read: 'x', write: [] })).toThrow(/read 应为字符串数组/)
    expect(() => parseScope({ step: 'translate', slug: 's', read: [1], write: [] })).toThrow(/read 应为字符串数组/)
    expect(() => parseScope({ step: 'translate', slug: 's', read: [], write: 'x' })).toThrow(/write 应为字符串数组/)
    expect(() => parseScope({ step: 'translate', slug: 's', read: [], write: [1] })).toThrow(/write 应为字符串数组/)
  })

  it('keeps only integer chapters', () => {
    const withChapter = parseScope({ step: 'translate', slug: 's', chapter: 2, read: ['a'], write: ['b'] })
    expect(withChapter).toEqual({ step: 'translate', slug: 's', chapter: 2, read: ['a'], write: ['b'] })
    const without = parseScope({ step: 'translate', slug: 's', chapter: 2.5, read: [], write: [] })
    expect(without).not.toHaveProperty('chapter')
  })
})

describe('scope path helpers', () => {
  it('builds deterministic scope paths', () => {
    expect(scopesDirRel('book')).toBe('produce/book/.scopes')
    expect(scopeFileRel('book', 'child-1')).toBe('produce/book/.scopes/child-1.json')
  })
})

describe('delay', () => {
  it('resolves after the timer', async () => {
    await expect(delay(new AbortController().signal, 1)).resolves.toBeUndefined()
  })

  it('rejects when already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('boom'))
    await expect(delay(controller.signal, 10)).rejects.toThrow('boom')
  })

  it('rejects a non-Error abort reason when already aborted', async () => {
    const controller = new AbortController()
    controller.abort('boom')
    await expect(delay(controller.signal, 10)).rejects.toThrow('aborted')
  })


  it('rejects when aborted while waiting', async () => {
    const controller = new AbortController()
    const pending = delay(controller.signal, 50)
    controller.abort(new Error('stop'))
    await expect(pending).rejects.toThrow('stop')
  })

  it('rejects a non-Error abort reason while waiting', async () => {
    const controller = new AbortController()
    const pending = delay(controller.signal, 50)
    controller.abort('stop')
    await expect(pending).rejects.toThrow('aborted')
  })

})

describe('findScopeForSession', () => {
  it('returns undefined when the signal is already aborted', async () => {
    const captured = captureCtx('/ws')
    const controller = new AbortController()
    controller.abort()
    const io = { ...toolFs({ fs: captured.ctx.fs }, fakeExec('/ws')), signal: controller.signal }
    await expect(findScopeForSession(io, 'child-1', 0)).resolves.toBeUndefined()
  })

  it('skips a broken scope directory and keeps scanning', async () => {
    const captured = captureCtx('/ws')
    const io = toolFs({ fs: captured.ctx.fs }, fakeExec('/ws'))
    captured.mem.seed('produce/book/state.json', JSON.stringify({ title: 'book', chapters: [] }))
    captured.mem.seed('produce/book/.scopes', '')
    captured.mem.seed('produce/zebra/state.json', JSON.stringify({ title: 'zebra', chapters: [] }))
    captured.mem.seed('produce/zebra/.scopes/child-1.json', JSON.stringify({
      step: 'translate',
      slug: 'zebra',
      read: [],
      write: [],
    }))
    const scope = await findScopeForSession(io, 'child-1', 0)
    expect(scope?.slug).toBe('zebra')
  })

  it('returns undefined when no scope exists', async () => {
    const captured = captureCtx('/ws')
    const io = toolFs({ fs: captured.ctx.fs }, fakeExec('/ws'))
    captured.mem.seed('produce/book/state.json', JSON.stringify({ title: 'book', chapters: [] }))
    await expect(findScopeForSession(io, 'missing', 0)).resolves.toBeUndefined()
  })
})
