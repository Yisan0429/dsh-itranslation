/** A deterministic paragraph work unit within a chapter (D22: the segment is the translation work unit). */
export interface ParagraphSegment {
  /** 1-based index of the paragraph within its chapter. */
  readonly index: number
  /** The paragraph text, trimmed of surrounding blank lines. */
  readonly text: string
  /** Sentence count used for the soft sentence-alignment warning (D24). */
  readonly sentenceCount: number
}

/**
 * Sentence terminators in both scripts. Abbreviations are not handled — this
 * is a deterministic estimator for the soft alignment warning, not a parser
 * (D24: sentence-count mismatch warns only, never blocks).
 */
const SENTENCE_END = /[.!?。！？]+/u

export function countSentences(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const sentences = trimmed.split(SENTENCE_END).filter(part => part.trim() !== '')
  return sentences.length === 0 ? 1 : sentences.length
}

/**
 * Deterministic paragraph segmentation (D22): split a chapter on blank lines,
 * trim each paragraph, and number the result 1-based. The final list is
 * persisted to `state.json` and drives per-segment translation; the main
 * agent may merge/split abnormal segments with the adjustment recorded.
 */
export function segmentParagraphs(chapter: string): ParagraphSegment[] {
  return chapter
    .split(/\n[ \t]*\n/u)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph !== '')
    .map((text, index) => ({ index: index + 1, text, sentenceCount: countSentences(text) }))
}
