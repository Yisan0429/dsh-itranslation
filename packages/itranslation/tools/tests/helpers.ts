/**
 * Test helpers for the tools package: an in-memory `ctx.fs` double plus a
 * tool-registry capturer, so each tool's `execute` body runs against real
 * `defineTool` definitions without booting a full DSH context.
 */

import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'

/** In-memory filesystem backed by maps of files and directory paths. */
export class MemFs {
  readonly files = new Map<string, string>()
  readonly dirs = new Set<string>()

  constructor(private readonly baseCwd = '/workspace') {}

  private abs(p: string, cwd?: string): string {
    return path.posix.isAbsolute(p)
      ? path.posix.normalize(p)
      : path.posix.normalize(path.posix.join(cwd ?? this.baseCwd, p))
  }

  private addDir(dir: string): void {
    let cur = dir
    while (cur !== '/' && cur !== '.') {
      this.dirs.add(cur)
      cur = path.posix.dirname(cur)
    }
    this.dirs.add('/')
  }

  readonly fs = {
    resolve: async (p: string, opts?: { cwd?: string }): Promise<FsTarget> => {
      const displayPath = this.abs(p, opts?.cwd)
      return { targetKey: displayPath as never, displayPath }
    },
    readText: async (target: FsTarget): Promise<string> => {
      const content = this.files.get(target.displayPath)
      if (content === undefined) throw new Error(`ENOENT: ${target.displayPath}`)
      return content
    },
    writeText: async (target: FsTarget, content: string): Promise<object> => {
      const dir = path.posix.dirname(target.displayPath)
      this.addDir(dir)
      this.files.set(target.displayPath, content)
      return { operation: 'create', version: 'v' as never, before: null, after: content }
    },
    stat: async (target: FsTarget): Promise<{ version: never; type: 'file' | 'directory' } | undefined> => {
      if (this.dirs.has(target.displayPath)) return { version: 'v' as never, type: 'directory' }
      if (this.files.has(target.displayPath)) return { version: 'v' as never, type: 'file' }
      return undefined
    },
    listDir: async (target: FsTarget): Promise<Array<{ name: string; type: 'file' | 'directory'; target: FsTarget; version: never }>> => {
      const prefix = target.displayPath === '/' ? '/' : `${target.displayPath}/`
      const names = new Set<string>()
      for (const file of this.files.keys()) {
        if (file.startsWith(prefix)) {
          const rest = file.slice(prefix.length)
          if (rest !== '' && !rest.includes('/')) names.add(rest)
        }
      }
      for (const dir of this.dirs) {
        if (dir.startsWith(prefix) && dir !== target.displayPath) {
          const rest = dir.slice(prefix.length)
          if (rest !== '' && !rest.includes('/')) names.add(rest)
        }
      }
      return [...names].sort().map(name => ({
        name,
        type: this.files.has(`${prefix}${name}`) ? 'file' : 'directory',
        target: { targetKey: `${prefix}${name}` as never, displayPath: `${prefix}${name}` },
        version: 'v' as never,
      }))
    },
  } as unknown as FileSystem

  /** Write a file and register its parent directories. */
  seed(file: string, content: string): void {
    const displayPath = this.abs(file)
    this.addDir(path.posix.dirname(displayPath))
    this.files.set(displayPath, content)
  }

  /** Read a file by its (absolute or cwd-relative) path, or undefined. */
  read(file: string): string | undefined {
    return this.files.get(this.abs(file))
  }
}

/** A captured tool registry plus the fake `ctx` it plugs into. */
export interface CapturedCtx {
  ctx: Context
  registered: ToolDefinition[]
  mem: MemFs
}

/** Build a fake `Context` whose `tools.register` captures definitions and `fs` is in-memory. */
export function captureCtx(cwd = '/workspace'): CapturedCtx {
  const mem = new MemFs(cwd)
  const registered: ToolDefinition[] = []
  const ctx = {
    tools: {
      register: (definition: ToolDefinition): (() => void) => {
        registered.push(definition)
        return () => {}
      },
    },
    fs: mem.fs,
  } as unknown as Context
  void cwd
  return { ctx, registered, mem }
}

/** Find a captured tool definition by name. */
export function toolByName(captured: CapturedCtx, name: string): ToolDefinition {
  const definition = captured.registered.find(candidate => candidate.name === name)
  if (definition === undefined) throw new Error(`tool not registered: ${name}`)
  return definition
}

/** A fake tool-execution context with the given session cwd. */
export function fakeExec(cwd = '/workspace'): ToolRunContext {
  const controller = new AbortController()
  return {
    callId: 'call-1' as never,
    rootCallId: 'call-1' as never,
    token: Symbol('token') as never,
    name: 'test',
    arguments: {},
    signal: controller.signal,
    agent: { session: { header: { cwd } } } as never,
    deferContext() {},
    concludeTurn() {},
  }
}

/** A fake tool-execution context with an explicitly supplied `agent`. */
export function fakeExecWithAgent(agent: unknown): ToolRunContext {
  const controller = new AbortController()
  return {
    callId: 'call-1' as never,
    rootCallId: 'call-1' as never,
    token: Symbol('token') as never,
    name: 'test',
    arguments: {},
    signal: controller.signal,
    agent,
    deferContext() {},
    concludeTurn() {},
  } as unknown as ToolRunContext
}

/** Resolve an args object's `execute` and run it against the fake exec. */
export async function run(
  definition: ToolDefinition,
  args: unknown,
  exec: ToolRunContext = fakeExec(),
): Promise<unknown> {
  return definition.execute(args, exec)
}
