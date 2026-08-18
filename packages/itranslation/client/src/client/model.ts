/**
 * Pure view-model derivation for itranslation tool calls. The Run card is a
 * keyed `tool.call.toolview` per deterministic tool (DESIGN.md §7): each row
 * reads only the frozen call/result slice and produces a small summary.
 */

import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/** Every deterministic tool registered by `@deepseek-ai/dsh-itranslation-tools` (D58). */
export const ITRANSLATION_TOOL_NAMES = [
  'itranslation.prepare',
  'itranslation.segment',
  'itranslation.glossary',
  'itranslation.align',
  'itranslation.assemble',
  'itranslation_status',
] as const

type ItranslationToolName = typeof ITRANSLATION_TOOL_NAMES[number]

/** Visual tone of one tool row. */
type ToolViewTone = 'running' | 'ok' | 'mismatch' | 'error'

/** Derived summary consumed by the row component. */
export interface ToolViewSummary {
  title: string
  headline: string
  detail: string[]
  tone: ToolViewTone
}

const TOOL_TITLES: Partial<Record<ItranslationToolName, string>> = {
  'itranslation.prepare': '准备书目',
  'itranslation.segment': '分段报告',
  'itranslation.glossary': '术语表',
  'itranslation.align': '对齐预览',
  'itranslation.assemble': '组装成品',
  itranslation_status: '翻译进度',
}

const PHASE_LABELS: Record<string, string> = {
  none: '未开始',
  prepared: '已准备',
  translating: '翻译中',
  aligned: '已对齐',
  audited: '已审查',
  assembled: '已组装',
}

type SummaryBody = Omit<ToolViewSummary, 'title'>

/** Human title for a tool key; unknown keys degrade to the wire name itself. */
export function toolTitle(toolName: string): string {
  return TOOL_TITLES[toolName as ItranslationToolName] ?? toolName
}

/** First text block of a settled tool result, or null while running/without text. */
export function resultText(block: ToolCallBlock): string | null {
  if (!('kind' in block)) return null
  for (const item of block.content) {
    if (item.type === 'text') return item.text
  }
  return null
}

/**
 * Parse a settled result's JSON text. `null` means there is no settled text
 * to parse; a malformed payload is carried as `ok: false` so the row can show
 * the raw text instead of pretending the call produced structured data.
 */
export function readResult(block: ToolCallBlock): { ok: true; value: unknown } | { ok: false; raw: string } | null {
  const raw = resultText(block)
  if (raw === null) return null
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, raw }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function integerField(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function booleanField(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function arrayField(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function genericBody(): SummaryBody {
  return { headline: '已完成', detail: [], tone: 'ok' }
}

function errorBody(block: ToolCallBlock): SummaryBody | null {
  if (!('kind' in block) || !block.isError) return null
  const name = block.error?.name
  const code = block.error?.code
  const detail = name !== undefined && name !== '' ? name : code
  return {
    headline: '调用失败',
    detail: detail === undefined ? [] : [detail],
    tone: 'error',
  }
}

function prepareBody(value: unknown): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const title = stringField(root.title)
  const slug = stringField(root.slug)
  const chapters = arrayField(root.chapters)
  const detail: string[] = []
  if (slug !== null) detail.push(`书目目录：books/${slug}`)
  detail.push(`章节：${chapters?.length ?? 0} 章`)
  return { headline: title ?? '已准备', detail, tone: 'ok' }
}

function segmentBody(value: unknown): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const chapters = arrayField(root.chapters) ?? []
  const overlong = arrayField(root.overlongChapters) ?? []
  const detail: string[] = []
  if (overlong.length > 0) detail.push(`超长章：${overlong.join(', ')}`)
  return { headline: `共 ${chapters.length} 章`, detail, tone: 'ok' }
}

function glossaryBody(value: unknown): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const entries = arrayField(root.entries)
  return { headline: `术语 ${entries?.length ?? 0} 条`, detail: [], tone: 'ok' }
}

function alignmentBody(value: unknown, kind: 'align' | 'assemble'): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const ok = booleanField(root.ok)
  if (ok === true) {
    const chapters = arrayField(root.chapters)
    const headline = kind === 'align' ? `对齐 ${chapters?.length ?? 0} 章` : '成品已生成'
    const detail: string[] = []
    if (kind === 'assemble') {
      const outputFile = stringField(root.outputFile)
      if (outputFile !== null) detail.push(`输出：${outputFile}`)
    }
    return { headline, detail, tone: 'ok' }
  }
  if (ok === false) {
    const mismatch = isRecord(root.mismatch) ? root.mismatch : null
    const message = stringField(root.message)
    const detail: string[] = []
    if (mismatch !== null) {
      const chapter = integerField(mismatch.chapterIndex)
      const expected = integerField(mismatch.expected)
      const actual = integerField(mismatch.actual)
      detail.push(`第 ${chapter ?? '?'} 章：应为 ${expected ?? '?'}，实际 ${actual ?? '?'}`)
    }
    if (message !== null) detail.push(message)
    return { headline: kind === 'align' ? '对齐失败' : '组装失败', detail, tone: 'mismatch' }
  }
  return genericBody()
}

function statusBody(value: unknown): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const translated = integerField(root.translatedChapters) ?? 0
  const total = integerField(root.totalChapters) ?? 0
  const phase = stringField(root.phase) ?? ''
  return {
    headline: `已译 ${translated}/${total} 章`,
    detail: [`阶段：${PHASE_LABELS[phase] ?? phase}`],
    tone: 'ok',
  }
}

/** Derive the summary shown on one itranslation tool row. */
export function summarizeToolCall(toolName: string, block: ToolCallBlock): ToolViewSummary {
  const title = toolTitle(toolName)
  const error = errorBody(block)
  if (error !== null) return { title, ...error }
  const read = readResult(block)
  if (read === null) return { title, headline: '运行中…', detail: [], tone: 'running' }
  if (!read.ok) return { title, headline: '结果解析失败', detail: [read.raw], tone: 'error' }
  let body: SummaryBody
  switch (toolName) {
    case 'itranslation.prepare': body = prepareBody(read.value); break
    case 'itranslation.segment': body = segmentBody(read.value); break
    case 'itranslation.glossary': body = glossaryBody(read.value); break
    case 'itranslation.align': body = alignmentBody(read.value, 'align'); break
    case 'itranslation.assemble': body = alignmentBody(read.value, 'assemble'); break
    case 'itranslation_status': body = statusBody(read.value); break
    default: body = genericBody()
  }
  return { title, ...body }
}
