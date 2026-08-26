import type { BookState, ChapterState } from './types'
import { stripHeadingAttributes } from './chapter'

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

/**
 * Build the Markdown heading line for a chapter; an empty title emits no
 * heading. When the glossary-based `titleTranslations` map carries the raw
 * title, the translated rendering is used (program-level heading translation:
 * `## The First Storm` → `## 第一场风暴`); absent an entry the raw title
 * stays.
 */
function chapterHeadingFor(chapter: ChapterState, titleTranslations?: ReadonlyMap<string, string>): string {
  if (chapter.title === '') return ''
  return `${CHAPTER_HEADING_PREFIX}${titleTranslations?.get(chapter.title) ?? chapter.title}`
}

/**
 * Whether a paragraph is the source book-title line carried as body content
 * (`# <book title>`, with optional Pandoc heading attributes): the engine
 * keeps everything before the first `##` heading as body, so the `#` title
 * line of the E2M file lands inside the first chapter's body. Assembly drops
 * that paragraph (and its translation) so the emitted book-title line is the
 * only title in the output (D-title-dedup).
 */
function isBookTitleParagraph(paragraph: string, bookTitle: string): boolean {
  if (!paragraph.startsWith('# ')) return false
  return stripHeadingAttributes(paragraph.slice(2).trim()) === bookTitle
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
 * The `##` heading is emitted from the raw chapter title, translated through
 * `titleTranslations` when it carries an entry.
 */
export function assembleChapter(
  chapter: ChapterState,
  source: string,
  translation: string,
  titleTranslations?: ReadonlyMap<string, string>,
): string {
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

  const heading = chapterHeadingFor(chapter, titleTranslations)
  const parts = heading === '' ? [] : [heading]
  parts.push(...translatedParagraphs)
  return parts.join('\n\n')
}

/**
 * Deterministic whole-book assembly (D56/D57): the book title line is always
 * emitted as `# ` — translated through `titleTranslations` when it carries an
 * entry — chapters follow as `## title` in `state.json` order. When the first
 * chapter is the empty-title chapter and its first source paragraph is the
 * book-title line (`# <book title>`, the title-as-body artifact), that
 * paragraph and its translation are dropped so the book-title line is not
 * duplicated. Chapter-count mismatch stops assembly by throwing
 * `TranslationMismatchError`; the tools layer asks the user how to proceed.
 */
export function assembleBook(
  book: BookState,
  sources: readonly string[],
  translations: readonly string[],
  titleTranslations?: ReadonlyMap<string, string>,
): string {
  if (book.chapters.length !== translations.length || sources.length !== translations.length) {
    throw new TranslationMismatchError('chapter-count', 1, book.chapters.length, translations.length)
  }

  const parts = [`${BOOK_HEADING_PREFIX}${titleTranslations?.get(book.title) ?? book.title}`]
  for (let index = 0; index < book.chapters.length; index += 1) {
    const chapter = book.chapters[index] as ChapterState
    let source = sources[index] as string
    let translation = translations[index] as string
    // Title-as-body dedup for the empty-title first chapter (see isBookTitleParagraph).
    if (index === 0 && chapter.title === '') {
      const sourceParagraphs = markdownParagraphs(source)
      const first = sourceParagraphs[0]
      if (first !== undefined && isBookTitleParagraph(first, book.title)) {
        source = sourceParagraphs.slice(1).join('\n\n')
        translation = markdownParagraphs(translation).slice(1).join('\n\n')
      }
    }
    const assembled = assembleChapter(chapter, source, translation, titleTranslations)
    if (assembled !== '') parts.push(assembled)
  }
  return parts.join('\n\n')
}
