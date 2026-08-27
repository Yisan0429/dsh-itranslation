/**
 * Automatic LLM-process evidence derivation for `itranslation_assemble`
 * (D34/D-processes). The main agent must NOT hand-fill model / timestamps /
 * token usage — that data is already in the session log, so the tool derives
 * it from the calling session's events and the agent only ever adds short
 * `notes`. Derivation is best-effort and structural (no harness type imports):
 *
 * - Model: the latest `request/header` event's `config.model`.
 * - Per-step records: every `tool/call` naming the subagent tools
 *   (`subagent` / `subagent_fork`) opens a record; its step is read from the
 *   run's `description` label via the pipeline label convention
 *   (`Pre-read:` / `Translate chapter N:` / `Audit:` / `Revise:`), and
 *   `startedAt` is the dispatch time. Background runs finish asynchronously,
 *   so `finishedAt` is only set when a run's end is derivable — the harness
 *   does not pair a background run's end to the parent log, so it is usually
 *   omitted rather than guessed.
 * - Orchestrator overhead: the parent's own LLM calls (`assistant/message`
 *   with `usage`) are summed into one `agent` record with real token usage.
 * - When the log carries no events (unit tests, manual runs), the caller's
 *   `processes` argument is used verbatim.
 */

import type { ProcessRecord } from './types'

/** The minimal structural view of one session event this module reads. */
export interface SessionEventLike {
  readonly type: string
  readonly time: number
  readonly data?: {
    readonly name?: string
    readonly arguments?: string
    readonly turn?: number
    readonly step?: number
    readonly usage?: {
      readonly inputTokens?: number
      readonly outputTokens?: number
      readonly cacheReadTokens?: number
      readonly cacheWriteTokens?: number
      readonly reasoningTokens?: number
    }
    readonly header?: { readonly config?: { readonly provider?: string; readonly model?: string } }
  }
}

/** Subagent tool names whose dispatch labels open a pipeline-step record. */
const SUBAGENT_TOOL_NAMES = new Set(['subagent', 'subagent_fork'])

/**
 * `itranslation_dispatch` opens a pipeline-step record too: the step rides its
 * `arguments` (`step`, `slug`, `chapter`), and it is the only dispatch path
 * the pipeline uses now.
 */
const DISPATCH_TOOL_NAME = 'itranslation_dispatch'

/**
 * `send_message` continues an existing subagent session instead of dispatching
 * a new one. The pipeline still needs the step (revision reuses the audit
 * session), so the step label rides the message prefix ("Revise: …").
 */
const SEND_MESSAGE_TOOL_NAME = 'send_message'

/** Map a subagent `description` label to a pipeline step name (label convention). */
export function stepFromLabel(label: string): string {
  const normalized = label.trim()
  if (/^pre[- ]?read/i.test(normalized)) return 'pre-read'
  if (/^translate/i.test(normalized)) return 'translate'
  if (/^audit/i.test(normalized)) return 'review'
  if (/^revise/i.test(normalized)) return 'revise'
  return 'other'
}

/** Parse a tool-call `arguments` JSON string and return its `description`, or undefined. */
function labelFromArguments(rawArguments: string | undefined): string | undefined {
  if (rawArguments === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(rawArguments)
  } catch {
    return undefined
  }
  const record = parsed as { description?: unknown; message?: unknown; step?: unknown; slug?: unknown; chapter?: unknown }
  if (typeof record.description === 'string' && record.description !== '') return record.description
  // send_message continues a subagent session: the pipeline step rides the
  // message's leading step prefix ("Revise: …"). Only a recognized prefix
  // counts — a plain follow-up is not a pipeline step.
  if (typeof record.message === 'string') {
    const message = record.message.trim()
    const prefix = message.split(/[\s:：]/)[0] ?? ''
    if (prefix !== '' && stepFromLabel(prefix) !== 'other') {
      return message.split('\n')[0] ?? undefined
    }
  }
  // itranslation_dispatch: the step, slug and chapter live in the arguments.
  if (record.step === 'pre-read' && typeof record.slug === 'string') return `Pre-read: ${record.slug}`
  if (record.step === 'translate' && typeof record.chapter === 'number') {
    return `Translate chapter ${record.chapter}${typeof record.slug === 'string' ? `: ${record.slug}` : ''}`
  }
  if (record.step === 'audit' && typeof record.slug === 'string') return `Audit: ${record.slug}`
  if (record.step === 'revise' && typeof record.slug === 'string') return `Revise: ${record.slug}`
  return undefined
}

/** Sum a usage object; an empty/absent usage yields undefined. */
function sumUsage(events: readonly SessionEventLike[]): ProcessRecord['tokenUsage'] | undefined {
  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  let reasoning = 0
  let any = false
  for (const event of events) {
    const usage = event.data?.usage
    if (usage === undefined) continue
    any = true
    input += usage.inputTokens ?? 0
    output += usage.outputTokens ?? 0
    cacheRead += usage.cacheReadTokens ?? 0
    cacheWrite += usage.cacheWriteTokens ?? 0
    reasoning += usage.reasoningTokens ?? 0
  }
  if (!any) return undefined
  const result: NonNullable<ProcessRecord['tokenUsage']> = { input, output }
  if (cacheRead > 0) result.cacheReadTokens = cacheRead
  if (cacheWrite > 0) result.cacheWriteTokens = cacheWrite
  if (reasoning > 0) result.reasoningTokens = reasoning
  return result
}

/**
 * Derive process records from a session event log. Empty input yields `[]`.
 */
export function deriveProcesses(events: readonly SessionEventLike[]): ProcessRecord[] {
  if (events.length === 0) return []

  let model: string | undefined
  for (const event of events) {
    if (event.type === 'request/header') {
      const config = event.data?.header?.config
      if (config?.model !== undefined && config.model !== '') model = config.model
    }
  }

  const records: ProcessRecord[] = []
  for (const event of events) {
    if (event.type !== 'tool/call') continue
    const name = event.data?.name
    if (name === undefined) continue
    const label = labelFromArguments(event.data?.arguments)
    if (name === DISPATCH_TOOL_NAME) {
      // The dispatch tool opens a step record from its arguments; an
      // unrecognized step (e.g. a malformed call) is skipped, not recorded.
      if (label === undefined) continue
      const record: ProcessRecord = {
        step: stepFromLabel(label),
        ...(model === undefined ? {} : { model }),
        startedAt: new Date(event.time).toISOString(),
        notes: label,
      }
      records.push(record)
      continue
    }
    if (name === SEND_MESSAGE_TOOL_NAME) {
      // A continued session only opens a step record when its message carries
      // the step prefix; plain follow-ups stay out of the evidence chain.
      if (label === undefined) continue
      const record: ProcessRecord = {
        step: stepFromLabel(label),
        ...(model === undefined ? {} : { model }),
        startedAt: new Date(event.time).toISOString(),
        notes: label,
      }
      records.push(record)
      continue
    }
    if (!SUBAGENT_TOOL_NAMES.has(name)) continue
    const step = label === undefined ? 'other' : stepFromLabel(label)
    const record: ProcessRecord = {
      step,
      ...(model === undefined ? {} : { model }),
      startedAt: new Date(event.time).toISOString(),
      ...(label === undefined ? {} : { notes: label }),
    }
    records.push(record)
  }

  // Orchestrator overhead: the parent's own LLM calls with real token usage.
  const usageEvents = events.filter(event => event.type === 'assistant/message' && event.data?.usage !== undefined)
  if (usageEvents.length > 0) {
    const usage = sumUsage(usageEvents)
    records.push({
      step: 'agent',
      ...(model === undefined ? {} : { model }),
      ...(usage === undefined ? {} : { tokenUsage: usage }),
      startedAt: new Date(usageEvents[0]?.time as number).toISOString(),
      finishedAt: new Date(usageEvents[usageEvents.length - 1]?.time as number).toISOString(),
    })
  }

  return records
}

/** Merge caller-supplied notes into derived records by step; unknown steps are appended. */
export function mergeProcessNotes(
  derived: readonly ProcessRecord[],
  supplied: readonly ProcessRecord[] | undefined,
): ProcessRecord[] {
  if (supplied === undefined || supplied.length === 0) return [...derived]
  const byStep = new Map<string, ProcessRecord>()
  for (const record of derived) byStep.set(record.step, record)
  for (const record of supplied) {
    const existing = byStep.get(record.step)
    if (existing === undefined) {
      byStep.set(record.step, { ...record })
    } else if (record.notes !== undefined && record.notes !== '') {
      byStep.set(record.step, { ...existing, notes: record.notes })
    }
  }
  return [...byStep.values()]
}
