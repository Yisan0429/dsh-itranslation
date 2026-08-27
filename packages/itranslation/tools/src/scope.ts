/**
 * Per-child file-access scopes for pipeline subagents (hard read/write fence).
 *
 * `itranslation_dispatch` writes one scope file per child —
 * `produce/<slug>/.scopes/<childId>.json` — BEFORE the child's first tool call.
 * The scoped tools (`itranslation_scoped_read` / `itranslation_scoped_write`)
 * and the glossary tool look the scope up by the CALLING session's id and
 * refuse every path outside the allowlists. The main agent's session has no
 * scope file, so the generic pipeline tools keep their current behavior.
 *
 * The scope carries CANONICAL absolute paths (resolved against the session
 * workspace root at dispatch time); the scoped tools canonicalize the
 * requested path the same way and compare by exact string, so neither a
 * relative/absolute spelling trick nor `..` traversal can escape the
 * allowlist. This is enforcement in the tool layer, not a prompt suggestion:
 * the dispatch also restricts the child's whole tool surface (toolFilter), so
 * a pipeline child has no bash/grep/glob/read/write to reach anything else.
 */

import path from 'node:path'
import { isDirectory, isFile, listDirNames, readJson, writeJson, type ToolFsContext } from './io'
import { bookDirRel } from './paths'

/** One pipeline step's access scope, persisted per child. */
export interface ChildScope {
  /** The pipeline step this child serves. */
  step: 'pre-read' | 'translate' | 'audit' | 'revise'
  /** The book slug this child may operate on (glossary pin). */
  slug: string
  /** Chapter number for translate children (1-based). */
  chapter?: number
  /** Canonical absolute paths the child may READ. */
  read: string[]
  /** Canonical absolute paths the child may WRITE. */
  write: string[]
}

/** Parse + validate a scope file payload. */
export function parseScope(raw: unknown): ChildScope {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('scope 文件格式错误：应为对象')
  }
  const record = raw as Record<string, unknown>
  const step = record.step
  const slug = record.slug
  if (step !== 'pre-read' && step !== 'translate' && step !== 'audit' && step !== 'revise') {
    throw new Error('scope 文件格式错误：step 非法')
  }
  if (typeof slug !== 'string' || slug === '') throw new Error('scope 文件格式错误：slug 缺失')
  const read = record.read
  const write = record.write
  if (!Array.isArray(read) || !read.every(item => typeof item === 'string')) {
    throw new Error('scope 文件格式错误：read 应为字符串数组')
  }
  if (!Array.isArray(write) || !write.every(item => typeof item === 'string')) {
    throw new Error('scope 文件格式错误：write 应为字符串数组')
  }
  return {
    step,
    slug,
    ...(typeof record.chapter === 'number' && Number.isInteger(record.chapter) ? { chapter: record.chapter } : {}),
    read,
    write,
  }
}

/** Scope directory, relative to the session workspace root. */
export function scopesDirRel(slug: string): string {
  return `${bookDirRel(slug)}/.scopes`
}

/** One child's scope file, relative to the session workspace root. */
export function scopeFileRel(slug: string, childId: string): string {
  return `${scopesDirRel(slug)}/${childId}.json`
}

/** Canonicalize a path exactly the way scope entries are recorded. */
export async function canonicalize(io: ToolFsContext, p: string): Promise<string> {
  const target = await io.fs.resolve(p, { cwd: io.cwd, signal: io.signal })
  return path.normalize(io.fs.processPath(target))
}

/** Persist a child's scope BEFORE the dispatch hands control to it. */
export async function writeScope(io: ToolFsContext, slug: string, childId: string, scope: ChildScope): Promise<void> {
  await writeJson(io, scopeFileRel(slug, childId), scope)
}

/** Delay helper that honors the call's cancellation signal. */
function delay(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Find the scope for a calling session across all books. A just-dispatched
 * child's scope file is written by the dispatch tool in the same turn the
 * child id is minted, so a short retry window covers the startup race; a
 * session with no scope (the main agent, or a call already being cancelled)
 * resolves `undefined`.
 *
 * The scan only treats real DIRECTORY entries under `produce/` as candidate book
 * slugs: a stray top-level file (e.g. the VCS placeholder `.gitkeep`, which
 * lists before any book directory) must never be probed as `produce/.gitkeep/
 * .scopes/<id>.json` — resolving that path throws because a parent segment is
 * a file, and one such candidate must not abort the whole scan (which would
 * hide every book's scope, not just its own). Candidates are sorted so the
 * scan order is deterministic as the book count grows.
 * @param io - the tool fs context (cwd = the session workspace root).
 * @param sessionId - the calling session id.
 * @param waitMs - how long to keep looking before giving up (default 2s).
 */
export async function findScopeForSession(
  io: ToolFsContext,
  sessionId: string,
  waitMs = 2000,
): Promise<ChildScope | undefined> {
  const deadline = Date.now() + waitMs
  for (;;) {
    if (io.signal.aborted) return undefined
    const names = (await listDirNames(io, 'produce')).sort()
    for (const name of names) {
      if (!(await isDirectory(io, bookDirRel(name)))) continue
      let found = false
      try {
        found = await isFile(io, scopeFileRel(name, sessionId))
      } catch {
        // One unresolvable/racy candidate (e.g. a broken symlink) is not
        // grounds to fail the lookup — skip it and keep scanning.
        continue
      }
      if (!found) continue
      return parseScope(await readJson(io, scopeFileRel(name, sessionId)))
    }
    if (Date.now() >= deadline) return undefined
    await delay(io.signal, 50)
  }
}
