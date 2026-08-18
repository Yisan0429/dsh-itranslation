/**
 * `state.json` read + validation. `state.json` is written by `prepare` as the
 * core `BookState` shape (`{ title, chapters: [{ index, title }] }`, D57); this
 * module defensively re-validates it before any downstream tool trusts it.
 */

import type { BookState, ChapterState } from '@deepseek-ai/dsh-itranslation-core'
import { readJson, type ToolFsContext } from './io'
import { stateRel } from './paths'

/** Validate one parsed chapter entry (1-based offset for error messages). */
function parseChapterState(raw: unknown, offset: number): ChapterState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`state.json 格式错误：第 ${offset + 1} 章应为对象`)
  }
  const record = raw as Record<string, unknown>
  const index = record.index
  const title = record.title
  if (typeof index !== 'number' || !Number.isInteger(index)) {
    throw new Error(`state.json 格式错误：第 ${offset + 1} 章 index 缺失或非整数`)
  }
  if (typeof title !== 'string') {
    throw new Error(`state.json 格式错误：第 ${offset + 1} 章 title 缺失或非字符串`)
  }
  return { index, title }
}

/** Validate an arbitrary JSON value as a `BookState`. */
export function parseState(value: unknown): BookState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('state.json 格式错误：应为 { title, chapters } 对象')
  }
  const record = value as Record<string, unknown>
  const title = record.title
  if (typeof title !== 'string') {
    throw new Error('state.json 格式错误：title 缺失或非字符串')
  }
  const chapters = record.chapters
  if (!Array.isArray(chapters)) {
    throw new Error('state.json 格式错误：chapters 缺失或非数组')
  }
  return { title, chapters: chapters.map(parseChapterState) }
}

/** Read and validate `state.json` for book `slug` (must exist). */
export async function readState(io: ToolFsContext, slug: string): Promise<BookState> {
  return parseState(await readJson(io, stateRel(slug)))
}
