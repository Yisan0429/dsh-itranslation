/**
 * Pure data contracts for the deterministic text engine. Types-only file:
 * carries no executable code (coverage-exempt by vitest config).
 */

/** A chapter detected from E2M-produced Markdown (D56: `##` headings are chapters). */
export interface Chapter {
  /** 1-based chapter number in book order. */
  readonly index: number
  /** Heading text with the `{#...}` attribute stripped, or empty for a single-chapter book. */
  readonly title: string
  /** Chapter body without the `##` heading line; `###` and deeper headings stay here. */
  readonly body: string
}

/** Per-chapter state persisted to `state.json` (DESIGN.md §5.5, D57). */
export interface ChapterState {
  /** 1-based chapter number in book order. */
  readonly index: number
  /** Heading text with attributes stripped; empty for a single-chapter book. */
  readonly title: string
}

/** Book-level state persisted to `state.json` (DESIGN.md §5.5). */
export interface BookState {
  /** Book title from the source file name (D56). */
  readonly title: string
  /** Chapters in book order; paragraph structure lives in the Markdown itself. */
  readonly chapters: readonly ChapterState[]
}
