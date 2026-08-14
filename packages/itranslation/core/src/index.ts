import { countSentences, segmentParagraphs, type ParagraphSegment } from './segment'
import { slugify } from './slug'

/**
 * Version stamp of the deterministic text engine; kept in sync with the
 * package version so tool runs can record which engine produced a state file
 * (auditable evidence chain, DESIGN.md §1 P1).
 */
export const engineVersion = '0.1.0'

export { countSentences, segmentParagraphs, type ParagraphSegment, slugify }
