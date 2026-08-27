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
  resolveSandboxPolicy,
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
    await writeText(io, 'produce/s/state.json', '{"a":1}')
    expect(mem.read('produce/s/state.json')).toBe('{"a":1}')
    expect(await readText(io, 'produce/s/state.json')).toBe('{"a":1}')
  })

  it('writeJson/readJson round-trip a value', async () => {
    const { io, mem } = ctx()
    await writeJson(io, 'produce/s/meta.json', { title: '三体', chapters: [{ index: 1, title: '一' }] })
    expect(await readJson(io, 'produce/s/meta.json')).toEqual({ title: '三体', chapters: [{ index: 1, title: '一' }] })
    expect(mem.read('produce/s/meta.json')).toContain('"title"')
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
    await writeText(io, 'produce/s/source/1.md', 'body')
    expect(await isDirectory(io, 'produce/s')).toBe(true)
    expect(await isDirectory(io, 'produce/s/source')).toBe(true)
  })

  it('lists direct child names, empty for an absent directory', async () => {
    const { io, mem } = ctx()
    expect(await listDirNames(io, 'produce/s/chapters')).toEqual([])
    mem.seed('produce/s/chapters/1.md', 'a')
    mem.seed('produce/s/chapters/2.md', 'b')
    mem.seed('produce/s/source/1.md', 's')
    expect(await listDirNames(io, 'produce/s/chapters')).toEqual(['1.md', '2.md'])
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

  it('toolFs tolerates a cordis-like ctx with no sandboxPolicy service', () => {
    // cordis Context proxies throw on bare property reads of undeclared
    // services ("cannot get property 'x' without inject"); resolveSandboxPolicy
    // must go through the safe `ctx.get` accessor instead of a bare read.
    const mem = new MemFs()
    const cordisLike = new Proxy(
      { fs: mem.fs, get: (_name: string) => undefined },
      {
        get(target, prop, receiver) {
          if (prop in target) return Reflect.get(target, prop, receiver) as unknown
          throw new Error(`cannot get property "${String(prop)}" without inject`)
        },
      },
    )
    const io = toolFs(cordisLike, fakeExec('/ws'))
    expect(io.cwd).toBe('/ws')
    expect(io.sandboxPolicy).toBeUndefined()
  })

  it('toolFs resolves the standing sandbox policy through ctx.get', () => {
    const mem = new MemFs()
    const policy = { mode: 'workspace-write', workspaceRoot: '/ws' }
    const ctx = {
      fs: mem.fs,
      get(name: string) {
        return name === 'sandboxPolicy' ? { resolve: () => policy } : undefined
      },
    }
    const io = toolFs(ctx, fakeExec('/ws'))
    expect(io.sandboxPolicy).toEqual(policy)
  })

  it('resolveSandboxPolicy passes an empty request without an agent', () => {
    const policy = { mode: 'workspace-write', workspaceRoot: '/ws' }
    let received: unknown
    const ctx = {
      get() {
        return { resolve: (request?: unknown) => { received = request; return policy } }
      },
    }
    expect(resolveSandboxPolicy(ctx, fakeExecWithAgent(undefined))).toEqual(policy)
    expect(received).toEqual({})
  })

  it('resolveSandboxPolicy passes the session when an agent exists', () => {
    const policy = { mode: 'workspace-write', workspaceRoot: '/ws' }
    let received: unknown
    const ctx = {
      get() {
        return { resolve: (request?: unknown) => { received = request; return policy } }
      },
    }
    const exec = fakeExec('/ws')
    expect(resolveSandboxPolicy(ctx, exec)).toEqual(policy)
    expect(received).toEqual({ session: exec.agent?.session })
  })

})
