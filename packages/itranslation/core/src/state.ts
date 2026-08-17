import { detectChapters } from './chapter'
import type { BookState, ChapterState } from './types'

/**
 * Build the book-level state persisted to `state.json` (DESIGN.md §5.5, D57):
 * chapter structure from `##` headings (D56), no per-paragraph list. The book
 * title comes from the source file name and is recorded as-is (D56).
 */
export function createBookState(markdown: string, title: string): BookState {
  const chapters: ChapterState[] = detectChapters(markdown).map(chapter => ({
    index: chapter.index,
    title: chapter.title,
  }))
  return { title, chapters }
}
