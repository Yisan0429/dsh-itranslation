/**
 * Pure view-model derivation for itranslation tool calls. The Run card is a
 * keyed `tool.call.toolview` per deterministic tool (DESIGN.md §7): each row
 * reads only the frozen call/result slice and produces a small summary.
 */

import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/** Every deterministic tool registered by `@yisan0429/dsh-itranslation-tools` (D58). */
export const ITRANSLATION_TOOL_NAMES = [
  'itranslation_prepare',
  'itranslation_segment',
  'itranslation_glossary',
  'itranslation_align',
  'itranslation_assemble',
  'itranslation_status',
] as const

type ItranslationToolName = typeof ITRANSLATION_TOOL_NAMES[number]

/** Visual tone of one tool row. */
export type ToolViewTone = 'running' | 'ok' | 'mismatch' | 'error'

/** Derived summary consumed by the row component. */
export interface ToolViewSummary {
  title: string
  headline: string
  detail: string[]
  tone: ToolViewTone
}

const TOOL_TITLES: Partial<Record<ItranslationToolName, string>> = {
  'itranslation_prepare': 'Prepare book',
  'itranslation_segment': 'Segmentation report',
  'itranslation_glossary': 'Glossary',
  'itranslation_align': 'Alignment preview',
  'itranslation_assemble': 'Assemble book',
  itranslation_status: 'Translation progress',
}

const PHASE_LABELS: Record<string, string> = {
  none: 'Not started',
  prepared: 'Prepared',
  translating: 'Translating',
  aligned: 'Aligned',
  audited: 'Audited',
  assembled: 'Assembled',
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
  return { headline: 'Completed', detail: [], tone: 'ok' }
}

function errorBody(block: ToolCallBlock): SummaryBody | null {
  if (!('kind' in block) || !block.isError) return null
  const name = block.error?.name
  const code = block.error?.code
  const detail = name !== undefined && name !== '' ? name : code
  return {
    headline: 'Call failed',
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
  if (slug !== null) detail.push(`Book dir: produce/${slug}`)
  detail.push(`Chapters: ${chapters?.length ?? 0}`)
  return { headline: title ?? 'Prepared', detail, tone: 'ok' }
}

function segmentBody(value: unknown): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const chapters = arrayField(root.chapters) ?? []
  const overlong = arrayField(root.overlongChapters) ?? []
  const detail: string[] = []
  if (overlong.length > 0) detail.push(`Overlong chapters: ${overlong.join(', ')}`)
  return { headline: `${chapters.length} chapters`, detail, tone: 'ok' }
}

function glossaryBody(value: unknown): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const entries = arrayField(root.entries)
  return { headline: `${entries?.length ?? 0} terms`, detail: [], tone: 'ok' }
}

function alignmentBody(value: unknown, kind: 'align' | 'assemble'): SummaryBody {
  const root = isRecord(value) ? value : null
  if (root === null) return genericBody()
  const ok = booleanField(root.ok)
  if (ok === true) {
    const chapters = arrayField(root.chapters)
    const headline = kind === 'align' ? `Aligned ${chapters?.length ?? 0} chapters` : 'Book assembled'
    const detail: string[] = []
    if (kind === 'assemble') {
      const outputFile = stringField(root.outputFile)
      if (outputFile !== null) detail.push(`Output: ${outputFile}`)
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
      detail.push(`Chapter ${chapter ?? '?'}: expected ${expected ?? '?'}, got ${actual ?? '?'}`)
    }
    if (message !== null) detail.push(message)
    return { headline: kind === 'align' ? 'Alignment mismatch' : 'Assembly mismatch', detail, tone: 'mismatch' }
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
    headline: `${translated}/${total} chapters translated`,
    detail: [`Phase: ${PHASE_LABELS[phase] ?? phase}`],
    tone: 'ok',
  }
}

/** Derive the summary shown on one itranslation tool row. */
export function summarizeToolCall(toolName: string, block: ToolCallBlock): ToolViewSummary {
  const title = toolTitle(toolName)
  const error = errorBody(block)
  if (error !== null) return { title, ...error }
  const read = readResult(block)
  if (read === null) return { title, headline: 'Running…', detail: [], tone: 'running' }
  if (!read.ok) return { title, headline: 'Result parse failed', detail: [read.raw], tone: 'error' }
  let body: SummaryBody
  switch (toolName) {
    case 'itranslation_prepare': body = prepareBody(read.value); break
    case 'itranslation_segment': body = segmentBody(read.value); break
    case 'itranslation_glossary': body = glossaryBody(read.value); break
    case 'itranslation_align': body = alignmentBody(read.value, 'align'); break
    case 'itranslation_assemble': body = alignmentBody(read.value, 'assemble'); break
    case 'itranslation_status': body = statusBody(read.value); break
    default: body = genericBody()
  }
  return { title, ...body }
}
