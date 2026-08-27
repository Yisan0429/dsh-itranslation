/**
 * Thin async helpers over the DSH `ctx.fs` service and the tool-execution
 * context. Every path is resolved against the calling session's workspace
 * cwd, and every operation forwards the call's cancellation signal.
 */

import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

/**
 * The per-call sandbox policy shape these tools stamp onto every mutation.
 * Structurally `{ mode, workspaceRoot }` — the subset of the fs backend's
 * `SandboxExecutionPolicy` that the fence consumes. Kept as a local duck type
 * (not an import) because this package must not hard-depend on
 * `@deepseek-ai/dsh-sandbox`; the bridge cast in {@link writeText} reconciles
 * the two spellings.
 */
export interface ToolSandboxPolicy {
  readonly mode: string
  readonly workspaceRoot: string
}

/**
 * The host `ctx.sandboxPolicy` service surface this package reaches
 * structurally (it is mounted by the host composition whenever a confining fs
 * backend is, D-sandbox).
 */
interface SandboxPolicyServiceLike {
  resolve(request?: { session?: unknown }): ToolSandboxPolicy
}

/** Cancellation and cwd needed by one tool body. */
export interface ToolFsContext {
  readonly fs: FileSystem
  readonly cwd: string
  readonly signal: AbortSignal
  /**
   * The standing sandbox policy of the calling session, resolved once per tool
   * call. `undefined` without a mounted host policy service (unit tests,
   * unsandboxed hosts) — the fs backend then applies its own default fence.
   */
  readonly sandboxPolicy?: ToolSandboxPolicy | undefined
}

/**
 * Resolve the calling agent's session workspace cwd (D31/D46). Throws with a
 * clear message when absent so `prepare` and every other tool refuse to start
 * without a work directory (D46).
 */
export function requireCwd(exec: ToolRunContext): string {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || cwd === '') {
    throw new Error('会话未配置工作目录（cwd）：请先为会话配置工作目录，再开始翻译（D46）')
  }
  return cwd
}

/**
 * Resolve the calling session's standing sandbox policy so every mutation is
 * fenced against the SESSION workspace root instead of the host's deployment
 * fallback (which can differ from the session cwd). Without a mounted service
 * this returns `undefined` and the backend's default fence applies.
 *
 * The cordis `Context` proxy throws `cannot get property "x" without inject`
 * on a bare property read of a service the executing fiber never declared, so
 * the lookup MUST go through the safe `ctx.get(name)` accessor (which returns
 * `undefined` when nothing provides the service). This mirrors the harness's
 * own fs tools (`tool-fs` resolves `ctx.get('sandboxPolicy')`).
 */
export function resolveSandboxPolicy(ctx: unknown, exec: ToolRunContext): ToolSandboxPolicy | undefined {
  const get = (ctx as { get?: (name: string) => unknown }).get
  const service = get === undefined ? undefined : (get.call(ctx, 'sandboxPolicy') as SandboxPolicyServiceLike | undefined)
  if (service === undefined) return undefined
  return service.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
}

/** Bundle `ctx.fs` + session cwd + signal + per-call sandbox policy into one filesystem context. */
export function toolFs(ctx: { readonly fs: FileSystem }, exec: ToolRunContext): ToolFsContext {
  return {
    fs: ctx.fs,
    cwd: requireCwd(exec),
    signal: exec.signal,
    sandboxPolicy: resolveSandboxPolicy(ctx, exec),
  }
}

/** Read a UTF-8 text file at `path` (relative to cwd) as one string. */
export async function readText(io: ToolFsContext, path: string): Promise<string> {
  const target = await io.fs.resolve(path, { cwd: io.cwd, signal: io.signal })
  return io.fs.readText(target, io.signal)
}

/** Atomically create or replace `path` (relative to cwd) with `content`. */
export async function writeText(io: ToolFsContext, path: string, content: string): Promise<void> {
  const target = await io.fs.resolve(path, { cwd: io.cwd, signal: io.signal })
  // The bridge cast: the fs backend types this parameter as its own
  // `SandboxExecutionPolicy`; our structurally identical `ToolSandboxPolicy`
  // is intentionally free of that hard dependency.
  await io.fs.writeText(target, content, undefined, io.signal, io.sandboxPolicy as never)
}

/** Whether `path` resolves to a regular file. */
export async function isFile(io: ToolFsContext, path: string): Promise<boolean> {
  const target = await io.fs.resolve(path, { cwd: io.cwd, signal: io.signal })
  const info = await io.fs.stat(target, io.signal)
  return info !== undefined && info.type === 'file'
}

/** Whether `path` resolves to a directory. */
export async function isDirectory(io: ToolFsContext, path: string): Promise<boolean> {
  const target = await io.fs.resolve(path, { cwd: io.cwd, signal: io.signal })
  const info = await io.fs.stat(target, io.signal)
  return info !== undefined && info.type === 'directory'
}

/** List direct child names of `dirPath`; an absent/non-directory yields `[]`. */
export async function listDirNames(io: ToolFsContext, dirPath: string): Promise<string[]> {
  const target = await io.fs.resolve(dirPath, { cwd: io.cwd, signal: io.signal })
  const info = await io.fs.stat(target, io.signal)
  if (info === undefined || info.type !== 'directory') return []
  const entries = await io.fs.listDir(target, io.signal)
  return entries.map(entry => entry.name)
}

/** Canonical lossless-JSON model render shared by every tool (matches tool-goal). */
export function renderJson(_args: unknown, value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** Write `value` as pretty-printed UTF-8 JSON at `path` (relative to cwd). */
export async function writeJson(io: ToolFsContext, path: string, value: unknown): Promise<void> {
  await writeText(io, path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Read and parse a UTF-8 JSON file at `path` (relative to cwd). */
export async function readJson(io: ToolFsContext, path: string): Promise<unknown> {
  return JSON.parse(await readText(io, path))
}
