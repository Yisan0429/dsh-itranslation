/**
 * Pure data contracts for the tools layer. Types-only file: carries no
 * executable code (coverage-exempt by vitest config). Fields are plain
 * (non-readonly) so they match `defineTool`'s schema-inferred output types.
 */

import type { MismatchKind } from '@deepseek-ai/dsh-itranslation-core'

/** One chapter's title/index summary, mirroring core `ChapterState`. */
export interface ChapterSummary {
  /** 1-based chapter number in book order. */
  index: number
  /** Heading text with attributes stripped; empty for a single-chapter book. */
  title: string
}

/** One term entry in `glossary.json` (DESIGN.md §5.5). */
export interface GlossaryEntry {
  /** Source term in the original language. */
  term: string
  /** Locked translation for the term. */
  translation: string
  /** Optional disambiguation or usage note. */
  note?: string
  /** Provenance: `pre-read` / `manual` / `revision`. */
  source?: string
}

/**
 * One LLM process record collected by the agent and stored in `meta.json`
 * (D29). `step`/`model`/`startedAt`/`finishedAt`/`tokenUsage` are derived
 * from the session log by `itranslation_assemble` (D-processes); the agent
 * only adds `notes`.
 */
export interface ProcessRecord {
  /** Process name: pre-read / translate / review / revise / agent / other. */
  step: string
  /** Model identifier, when the log recorded it. */
  model?: string
  /** ISO start timestamp. */
  startedAt?: string
  /** ISO finish timestamp. */
  finishedAt?: string
  /** Token usage summed from the stream `usage` chunks, when the adapter reported them. */
  tokenUsage?: {
    input?: number
    output?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
  }
  /** Free-form annotation (e.g. chapter range, revision scope). */
  notes?: string
}

/** `meta.json` evidence-chain shape written by `itranslation_assemble` (D34). */
export interface MetaFile {
  schemaVersion: number
  /** Deterministic engine version that produced the run (DESIGN.md §1 P1). */
  engineVersion: string
  title: string
  slug: string
  /** Book directory relative to the session workspace root. */
  bookDir: string
  /** Per-chapter structure with the deterministic paragraph count. */
  chapters: { index: number; title: string; paragraphs: number }[]
  /** Final Markdown output path, relative to the session workspace root. */
  outputFile: string
  assembledAt: string
  processes: ProcessRecord[]
}

/** `itranslation_prepare` result. */
export interface PrepareResult {
  slug: string
  bookDir: string
  title: string
  chapters: ChapterSummary[]
  sourceFiles: string[]
}

/** Per-chapter deterministic segmentation report (D57: read-only, not persisted). */
export interface SegmentChapter {
  index: number
  title: string
  paragraphs: number
  sentences: number
  bytes: number
  /** Whether the chapter exceeds the configured over-long budget (D57). */
  overlong: boolean
}

/** `itranslation_segment` result. */
export interface SegmentResult {
  slug: string
  chapters: SegmentChapter[]
  overlongChapters: number[]
}

/** `itranslation_glossary` result. */
export interface GlossaryResult {
  slug: string
  entries: GlossaryEntry[]
  /** Soft scope warnings (e.g. a single `set` over the soft threshold); absent when clean. */
  warnings?: string[]
}

/** `itranslation_dispatch` result: the complete subagent task text, used verbatim. */
export interface DispatchResult {
  ok: true
  step: 'pre-read' | 'translate' | 'audit' | 'revise'
  language: string
  /** The full dispatch prompt: language, paths, fixed prompt, fixed report fields. */
  text: string
}

/** Per-chapter paragraph alignment after deterministic assembly. */
export interface AlignChapter {
  index: number
  title: string
  sourceParagraphs: number
  translationParagraphs: number
}

/** Paragraph/chapter-count mismatch reported by `align`/`assemble` (D56). */
export interface MismatchReport {
  kind: MismatchKind
  chapterIndex: number
  expected: number
  actual: number
}

/** `itranslation_align` result: `ok` plus either aligned chapters or a mismatch. */
export interface AlignResult {
  ok: boolean
  slug: string
  alignedFile?: string
  chapters: AlignChapter[]
  mismatch?: MismatchReport
  message?: string
}

/** `itranslation_assemble` result. */
export interface AssembleResult {
  ok: boolean
  slug: string
  outputFile?: string
  metaFile?: string
  chapterCount?: number
  mismatch?: MismatchReport
  message?: string
}

/** Which book-directory artifacts `itranslation_status` observed. */
interface StatusArtifacts {
  state: boolean
  glossary: boolean
  audit: boolean
  aligned: boolean
  meta: boolean
  output: boolean
}

/** Coarse workflow phase derived from observed artifacts. */
export type BookPhase = 'none' | 'prepared' | 'translating' | 'aligned' | 'audited' | 'assembled'

/** `itranslation_status` result. */
export interface StatusResult {
  slug: string
  bookDir: string
  exists: boolean
  totalChapters: number
  sourceChapters: number
  translatedChapters: number
  artifacts: StatusArtifacts
  phase: BookPhase
}
