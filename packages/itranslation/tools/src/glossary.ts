/**
 * `itranslation_glossary` — deterministic `glossary.json` management
 * (DESIGN.md §3 step 2 / §5.4): upsert (`set`) and remove (`remove`) term
 * entries and write the result back. The LLM side (pre-read, human review)
 * decides terms; this tool only applies and persists them.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { isFile, readJson, renderJson, toolFs, writeJson } from './io'
import { glossaryRel } from './paths'
import { readState } from './state'
import type { GlossaryEntry, GlossaryResult } from './types'

/** Hard cap on glossary size: beyond this the write is refused (over-broad collection). */
const MAX_GLOSSARY_ENTRIES = 200

/** Soft-warning threshold for one `set` call: above it the result carries a scope hint. */
const SOFT_WARN_SET_SIZE = 100

/** One entry as the model supplies it in `set`. */
interface GlossarySetEntry {
  readonly term: string
  readonly translation: string
  readonly note?: string
}

/** Validate + normalize one `set` entry, attaching provenance (default `manual`). */
function normalizeEntry(raw: GlossarySetEntry, source: string): GlossaryEntry {
  const term = raw.term.trim()
  const translation = raw.translation.trim()
  if (term === '') throw new Error('术语表条目 term 不能为空')
  if (translation === '') throw new Error(`术语「${term}」的 translation 不能为空`)
  const entry: GlossaryEntry = {
    term,
    translation,
    source,
    ...(raw.note !== undefined && raw.note !== '' ? { note: raw.note } : {}),
  }
  return entry
}

/** Parse `glossary.json` content; a missing file yields `[]`. */
export function parseGlossary(value: unknown): GlossaryEntry[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('glossary.json 格式错误：应为 { entries } 对象')
  }
  const entries = (value as Record<string, unknown>).entries
  if (!Array.isArray(entries)) throw new Error('glossary.json 格式错误：entries 缺失或非数组')
  return entries.map((raw, offset) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`glossary.json 格式错误：第 ${offset + 1} 条应为对象`)
    }
    const record = raw as Record<string, unknown>
    const term = record.term
    const translation = record.translation
    if (typeof term !== 'string' || term === '') {
      throw new Error(`glossary.json 格式错误：第 ${offset + 1} 条 term 缺失或非字符串`)
    }
    if (typeof translation !== 'string') {
      throw new Error(`glossary.json 格式错误：术语「${term}」的 translation 缺失或非字符串`)
    }
    const entry: GlossaryEntry = {
      term,
      translation,
      ...(typeof record.note === 'string' ? { note: record.note } : {}),
      ...(typeof record.source === 'string' ? { source: record.source } : {}),
    }
    return entry
  })
}

/** Apply removals then upserts (by term) over the current entries. */
function mergeEntries(
  current: readonly GlossaryEntry[],
  set: readonly GlossaryEntry[],
  remove: ReadonlySet<string>,
): GlossaryEntry[] {
  const merged = current.filter(entry => !remove.has(entry.term))
  for (const entry of set) {
    const existing = merged.findIndex(candidate => candidate.term === entry.term)
    if (existing >= 0) merged[existing] = entry
    else merged.push(entry)
  }
  return merged
}

export function applyGlossary(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_glossary',
    description: '术语表确定性管理：按 term 增补（set）或删除（remove）条目并回写 glossary.json；'
      + '不带 set/remove 时只读返回当前条目。须先 itranslation_prepare。',
    parameters: {
      slug: {
        type: 'string',
        required: true,
        description: '书目 slug（itranslation_prepare 返回的 slug）。',
      },
      set: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            term: { type: 'string', required: true },
            translation: { type: 'string', required: true },
            note: { type: 'string' },
          },
        },
        description: '按 term 增补/覆盖的条目。',
      },
      remove: {
        type: 'array',
        items: { type: 'string' },
        description: '按 term 删除的条目。',
      },
      source: {
        type: 'string',
        description: '本次增补条目的来源标记（缺省 manual）。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slug: { type: 'string', required: true },
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                term: { type: 'string', required: true },
                translation: { type: 'string', required: true },
                note: { type: 'string' },
                source: { type: 'string' },
              },
            },
          },
          warnings: {
            type: 'array',
            items: { type: 'string' },
            description: '软警告：本次操作触发的范围提示（如单次新增过多条目），不拦截写入。',
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      await readState(io, args.slug)
      const source = args.source ?? 'manual'
      const set = (args.set ?? []).map(entry => normalizeEntry(entry, source))
      const remove = new Set(args.remove ?? [])

      const current = await isFile(io, glossaryRel(args.slug))
        ? parseGlossary(await readJson(io, glossaryRel(args.slug)))
        : []
      const merged = mergeEntries(current, set, remove)

      // Hard cap: a glossary beyond the bound signals over-broad collection
      // (title/name/contested entries only), so the write is refused loudly.
      if (merged.length > MAX_GLOSSARY_ENTRIES) {
        throw new Error(
          `术语表超过上限 ${MAX_GLOSSARY_ENTRIES} 条（当前 ${merged.length} 条）：只应收录标题/章名、专名、`
            + '有争议或非显然译法的术语，请精简后再写入',
        )
      }

      const warnings: string[] = []
      if (args.set !== undefined && args.set.length > SOFT_WARN_SET_SIZE) {
        warnings.push(
          `本次新增 ${args.set.length} 条术语，超过 ${SOFT_WARN_SET_SIZE} 条软阈值：请确认没有收录`
            + '「唯一自然译法的普通名词」等无争议条目（软警告，不拦截）',
        )
      }

      const changed = args.set !== undefined || args.remove !== undefined
      if (changed) await writeJson(io, glossaryRel(args.slug), { entries: merged })

      const result: GlossaryResult = { slug: args.slug, entries: merged, ...(warnings.length > 0 ? { warnings } : {}) }
      return result
    },
  }))
}
