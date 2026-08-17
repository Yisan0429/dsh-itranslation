import { assembleBook, assembleChapter, joinChapterFragments, TranslationMismatchError } from './assemble'
import { detectChapters, normalizeMarkdown, stripHeadingAttributes } from './chapter'
import { countSentences, segmentParagraphs } from './segment'
import { slugify } from './slug'
import { createBookState } from './state'

/**
 * Version stamp of the deterministic text engine; kept in sync with the
 * package version so tool runs can record which engine produced a state file
 * (auditable evidence chain, DESIGN.md §1 P1).
 */
export const engineVersion = '0.1.0'

export {
  assembleBook,
  assembleChapter,
  countSentences,
  createBookState,
  detectChapters,
  joinChapterFragments,
  normalizeMarkdown,
  segmentParagraphs,
  slugify,
  stripHeadingAttributes,
  TranslationMismatchError,
}

export type {
  BookState,
  Chapter,
  ChapterState,
} from './types'
export type { MismatchKind } from './assemble'
export type { ParagraphSegment } from './segment'
