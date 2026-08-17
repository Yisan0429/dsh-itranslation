import type { Chapter } from './types'

const CHAPTER_HEADING_LINE = /^##[ \t]+(\S.*)$/u
const HEADING_ATTRIBUTES = /[ \t]*\{#[^}]*\}[ \t]*$/u

/**
 * Remove the Pandoc/Markdown heading attribute E2M appends to headings,
 * e.g. `## 第一章 {#第一章}` becomes `第一章`.
 */
export function stripHeadingAttributes(title: string): string {
  return title.replace(HEADING_ATTRIBUTES, '').trim()
}

/**
 * Normalize raw text into engine-internal Markdown: strip a BOM, unify line
 * endings to `\n`, drop trailing whitespace on each line, and trim leading /
 * trailing blank lines. Blank lines inside the text are preserved because a
 * blank line is the Markdown paragraph boundary (D55).
 */
export function normalizeMarkdown(raw: string): string {
  return raw
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .trim()
}

/**
 * Detect chapters in E2M-produced Markdown (D56): only `##` headings are
 * chapter boundaries. A `#` book-title line and `###` / deeper headings are
 * ordinary body text. Content before the first `##` heading becomes its own
 * chapter with an empty title; a book with no `##` heading becomes a single
 * chapter with an empty title.
 */
export function detectChapters(markdown: string): Chapter[] {
  const normalized = normalizeMarkdown(markdown)
  const chapters: Chapter[] = []
  let currentTitle = ''
  const bodyLines: string[] = []

  const flush = (): void => {
    const body = bodyLines.join('\n').trim()
    chapters.push({
      index: chapters.length + 1,
      title: currentTitle,
      body,
    })
    bodyLines.length = 0
  }

  for (const line of normalized.split('\n')) {
    const chapterMatch = CHAPTER_HEADING_LINE.exec(line)
    if (chapterMatch) {
      if (bodyLines.length > 0 || currentTitle !== '') {
        flush()
      }
      currentTitle = stripHeadingAttributes(chapterMatch[1] as string)
    } else {
      bodyLines.push(line)
    }
  }
  flush()
  return chapters
}
