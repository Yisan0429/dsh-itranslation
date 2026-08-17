import type { BookState, ChapterState } from './types'

const BLANK_LINE = /\n[ \t]*\n/u
const BOOK_HEADING_PREFIX = '# '
const CHAPTER_HEADING_PREFIX = '## '

/** Kind of mismatch that stops deterministic assembly (D56). */
export type MismatchKind = 'chapter-count' | 'paragraph-count'

/**
 * Raised when translated output does not match the source structure (D56).
 * The tools layer catches this, stops, and asks the user how to proceed
 * (continue, retranslate, or ignore) instead of silently continuing.
 */
export class TranslationMismatchError extends Error {
  readonly kind: MismatchKind
  readonly chapterIndex: number
  readonly expected: number
  readonly actual: number

  constructor(kind: MismatchKind, chapterIndex: number, expected: number, actual: number) {
    super(
      kind === 'chapter-count'
        ? `章数失配：清单 ${expected} 章，译文 ${actual} 章`
        : `第 ${chapterIndex} 章段落数失配：原文 ${expected} 段，译文 ${actual} 段`,
    )
    this.name = 'TranslationMismatchError'
    this.kind = kind
    this.chapterIndex = chapterIndex
    this.expected = expected
    this.actual = actual
  }
}

/** Split Markdown text into paragraphs on blank lines (D55/D57). */
function markdownParagraphs(markdown: string): string[] {
  return markdown
    .split(BLANK_LINE)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph !== '')
}

/** Build the Markdown heading line for a chapter; an empty title emits no heading. */
function chapterHeadingFor(chapter: ChapterState): string {
  if (chapter.title === '') return ''
  return `${CHAPTER_HEADING_PREFIX}${chapter.title}`
}

/**
 * Join translated fragments of an over-long chapter (`chapters/<n>.<k>.md`,
 * D48) into one Markdown body before chapter assembly. Blank fragments are
 * ignored and the surviving text is joined with a blank line.
 */
export function joinChapterFragments(fragments: readonly string[]): string {
  return fragments
    .map(fragment => fragment.trim())
    .filter(fragment => fragment !== '')
    .join('\n\n')
}

/**
 * Deterministic chapter assembly (D56/D57): the source and translation are
 * split on blank lines and their paragraph counts must match, otherwise a
 * `TranslationMismatchError` stops assembly. Sentence counts are not checked.
 */
export function assembleChapter(chapter: ChapterState, source: string, translation: string): string {
  const sourceParagraphs = markdownParagraphs(source)
  const translatedParagraphs = markdownParagraphs(translation)

  if (sourceParagraphs.length !== translatedParagraphs.length) {
    throw new TranslationMismatchError(
      'paragraph-count',
      chapter.index,
      sourceParagraphs.length,
      translatedParagraphs.length,
    )
  }

  const heading = chapterHeadingFor(chapter)
  const parts = heading === '' ? [] : [heading]
  parts.push(...translatedParagraphs)
  return parts.join('\n\n')
}

/**
 * Deterministic whole-book assembly (D56/D57): the book title line is always
 * emitted as `# ` (empty title emits an empty `#` line), chapters follow as
 * `## title` in `state.json` order. Chapter-count mismatch stops assembly by
 * throwing `TranslationMismatchError`; the tools layer asks the user how to
 * proceed.
 */
export function assembleBook(
  book: BookState,
  sources: readonly string[],
  translations: readonly string[],
): string {
  if (book.chapters.length !== translations.length || sources.length !== translations.length) {
    throw new TranslationMismatchError('chapter-count', 1, book.chapters.length, translations.length)
  }

  const parts = [`${BOOK_HEADING_PREFIX}${book.title}`]
  for (let index = 0; index < book.chapters.length; index += 1) {
    const chapter = book.chapters[index] as ChapterState
    const assembled = assembleChapter(chapter, sources[index] as string, translations[index] as string)
    if (assembled !== '') parts.push(assembled)
  }
  return parts.join('\n\n')
}
