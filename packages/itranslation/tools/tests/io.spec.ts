import { describe, expect, it } from 'vitest'
import { fakeExec, fakeExecWithAgent, MemFs } from './helpers'
import {
  isDirectory,
  isFile,
  listDirNames,
  readJson,
  readText,
  renderJson,
  requireCwd,
  toolFs,
  writeJson,
  writeText,
} from '../src/io'

describe('requireCwd', () => {
  it('returns the calling agent session cwd', () => {
    expect(requireCwd(fakeExec('/ws'))).toBe('/ws')
  })

  it('throws when the session has no cwd', () => {
    expect(() => requireCwd(fakeExecWithAgent(undefined))).toThrow(/工作目录/)
  })

  it('throws on an empty cwd', () => {
    expect(() => requireCwd(fakeExecWithAgent({ session: { header: { cwd: '' } } }))).toThrow(/工作目录/)
  })
})

describe('io helpers over ctx.fs', () => {
  function ctx() {
    const mem = new MemFs()
    const fs = mem.fs
    const cwd = '/workspace'
    const io = { fs, cwd, signal: new AbortController().signal }
    return { mem, io }
  }

  it('round-trips text through writeText and readText', async () => {
    const { io, mem } = ctx()
    await writeText(io, 'books/s/state.json', '{"a":1}')
    expect(mem.read('books/s/state.json')).toBe('{"a":1}')
    expect(await readText(io, 'books/s/state.json')).toBe('{"a":1}')
  })

  it('writeJson/readJson round-trip a value', async () => {
    const { io, mem } = ctx()
    await writeJson(io, 'books/s/meta.json', { title: '三体', chapters: [{ index: 1, title: '一' }] })
    expect(await readJson(io, 'books/s/meta.json')).toEqual({ title: '三体', chapters: [{ index: 1, title: '一' }] })
    expect(mem.read('books/s/meta.json')).toContain('"title"')
  })

  it('detects files and directories', async () => {
    const { io, mem } = ctx()
    mem.seed('a.txt', 'x')
    expect(await isFile(io, 'a.txt')).toBe(true)
    expect(await isDirectory(io, 'a.txt')).toBe(false)
    expect(await isFile(io, 'missing.txt')).toBe(false)
  })

  it('detects directories created by writeText', async () => {
    const { io } = ctx()
    await writeText(io, 'books/s/source/1.md', 'body')
    expect(await isDirectory(io, 'books/s')).toBe(true)
    expect(await isDirectory(io, 'books/s/source')).toBe(true)
  })

  it('lists direct child names, empty for an absent directory', async () => {
    const { io, mem } = ctx()
    expect(await listDirNames(io, 'books/s/chapters')).toEqual([])
    mem.seed('books/s/chapters/1.md', 'a')
    mem.seed('books/s/chapters/2.md', 'b')
    mem.seed('books/s/source/1.md', 's')
    expect(await listDirNames(io, 'books/s/chapters')).toEqual(['1.md', '2.md'])
  })

  it('renders JSON as a single text block', () => {
    expect(renderJson({}, { ok: true })).toEqual([{ type: 'text', text: '{"ok":true}' }])
  })

  it('toolFs bundles fs, cwd and signal', () => {
    const mem = new MemFs()
    const io = toolFs({ fs: mem.fs }, fakeExec('/ws'))
    expect(io.cwd).toBe('/ws')
    expect(typeof io.signal).toBe('object')
  })
})
