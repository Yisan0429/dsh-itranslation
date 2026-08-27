/**
 * Pure book-directory path helpers. Every path is RELATIVE to the session
 * workspace root (`exec.agent.session.header.cwd`, D31), matching the
 * `<cwd>/produce/<slug>/` layout in DESIGN.md §5.5 (D70: user input arrives
 * under `<cwd>/input/` and the final artifact lands under `<cwd>/output/`).
 * `slugify` comes from the deterministic core engine (D42).
 */

import { slugify } from '@deepseek-ai/dsh-itranslation-core'

/** Top-level produce directory under the session workspace root (DESIGN.md §5.5). */
const PRODUCE_DIR = 'produce'

/** User input directory: E2M-produced Markdown books the user drops here (D70). */
const INPUT_DIR = 'input'

/** Final-artifact directory: assembled `<slug>.md` only (D70). */
const OUTPUT_DIR = 'output'

/** Deterministic directory slug for a book title (D42). */
export function bookSlug(title: string): string {
  return slugify(title)
}

/** Book directory path, relative to the session workspace root. */
export function bookDirRel(slug: string): string {
  return `${PRODUCE_DIR}/${slug}`
}

/** `state.json` path (chapter structure only, D57). */
export function stateRel(slug: string): string {
  return `${bookDirRel(slug)}/state.json`
}

/** Cleaned source backup for chapter `index` (1-based, DESIGN.md §5.5). */
export function sourceRel(slug: string, index: number): string {
  return `${bookDirRel(slug)}/source/${index}.md`
}

/** Translated-chapter directory path. */
export function chaptersDirRel(slug: string): string {
  return `${bookDirRel(slug)}/chapters`
}

/** Translated chapter `index` (normal chapter, one agent). */
export function chapterRel(slug: string, index: number): string {
  return `${chaptersDirRel(slug)}/${index}.md`
}

/** Translated fragment `<n>.<k>.md` of an over-long chapter (D48). */
export function fragmentRel(slug: string, index: number, fragment: number): string {
  return `${chaptersDirRel(slug)}/${index}.${fragment}.md`
}

/** `glossary.json` path. */
export function glossaryRel(slug: string): string {
  return `${bookDirRel(slug)}/glossary.json`
}

/** `audit-report.md` path (written by the review process). */
export function auditRel(slug: string): string {
  return `${bookDirRel(slug)}/audit-report.md`
}

/** `aligned.md` path (pre-review alignment preview written by `align`). */
export function alignedRel(slug: string): string {
  return `${bookDirRel(slug)}/aligned.md`
}

/** `meta.json` evidence-chain path (written by `assemble`). */
export function metaRel(slug: string): string {
  return `${bookDirRel(slug)}/meta.json`
}

/** User input directory path, relative to the session workspace root (D70). */
export function inputDirRel(): string {
  return INPUT_DIR
}

/** Final Markdown output path (slug-named file under `output/`, D70). */
export function outputRel(slug: string): string {
  return `${OUTPUT_DIR}/${slug}.md`
}

/**
 * Derive a book title from a Markdown file path (D56: the book title comes
 * from the file name). Returns the basename without its final extension; a
 * dotfile or empty basename is returned as-is (callers validate).
 */
export function titleFromPath(path: string): string {
  const segments = path.split('/')
  const base = segments[segments.length - 1] as string
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? base : base.slice(0, dot)
}
