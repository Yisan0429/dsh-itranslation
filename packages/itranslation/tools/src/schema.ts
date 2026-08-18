/**
 * Shared `defineTool` schema fragments (D58). Reused by the tools that return
 * the same JSON shapes so their declarations stay consistent and duplicate
 * schema blocks stay out of the tool files.
 */

/** Structured paragraph/chapter-count mismatch report (D56). */
export const mismatchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', required: true, enum: ['chapter-count', 'paragraph-count'] },
    chapterIndex: { type: 'integer', required: true },
    expected: { type: 'integer', required: true },
    actual: { type: 'integer', required: true },
  },
} as const

/** Chapter summary list used by `prepare` (and mirrored by `status`/`segment` shapes). */
export const chapterSummarySchema = {
  type: 'array',
  required: true,
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      index: { type: 'integer', required: true },
      title: { type: 'string', required: true },
    },
  },
} as const
