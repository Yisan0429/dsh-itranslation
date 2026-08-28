/**
 * `itranslation_segment` — deterministic read-only segmentation report
 * (DESIGN.md §3 step 3, D57): paragraph/sentence/byte counts per chapter with
 * an over-long flag. Segment structure lives in the Markdown blank lines, so
 * this tool writes nothing; the main agent stops on flagged chapters (D57).
 */

import type { Context } from '@deepseek-ai/cordis'
import { segmentParagraphs } from '@yisan0429/dsh-itranslation-core'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readText, renderJson, toolFs } from './io'
import { sourceRel } from './paths'
import { readState } from './state'
import type { SegmentChapter, SegmentResult } from './types'

/** Filter a state's chapters to a single requested index, else keep all. */
function selectChapters(
  chapters: readonly { readonly index: number; readonly title: string }[],
  requested: number | undefined,
): readonly { readonly index: number; readonly title: string }[] {
  if (requested === undefined) return chapters
  const found = chapters.find(chapter => chapter.index === requested)
  if (found === undefined) {
    throw new Error(`第 ${requested} 章不存在（共 ${chapters.length} 章）`)
  }
  return [found]
}

export function applySegment(ctx: Context, overlongThresholdBytes: number): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_segment',
    description: '确定性分段报告（只读，不写盘）：按 Markdown 空行统计每章段数、句数与字节，'
      + '并标记超出上下文预算的超长章（D57）。须先 itranslation_prepare。',
    parameters: {
      slug: {
        type: 'string',
        required: true,
        description: '书目 slug（itranslation_prepare 返回的 slug）。',
      },
      chapter: {
        type: 'integer',
        description: '可选：只报告某一章（1-based）；缺省报告全书。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slug: { type: 'string', required: true },
          chapters: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'integer', required: true },
                title: { type: 'string', required: true },
                paragraphs: { type: 'integer', required: true },
                sentences: { type: 'integer', required: true },
                bytes: { type: 'integer', required: true },
                overlong: { type: 'boolean', required: true },
              },
            },
          },
          overlongChapters: {
            type: 'array',
            required: true,
            items: { type: 'integer' },
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      const state = await readState(io, args.slug)
      const selected = selectChapters(state.chapters, args.chapter)

      const chapters: SegmentChapter[] = []
      for (const chapter of selected) {
        const body = await readText(io, sourceRel(args.slug, chapter.index))
        const paragraphs = segmentParagraphs(body)
        const sentences = paragraphs.reduce((sum, paragraph) => sum + paragraph.sentenceCount, 0)
        const bytes = Buffer.byteLength(body, 'utf8')
        chapters.push({
          index: chapter.index,
          title: chapter.title,
          paragraphs: paragraphs.length,
          sentences,
          bytes,
          overlong: bytes > overlongThresholdBytes,
        })
      }

      const result: SegmentResult = {
        slug: args.slug,
        chapters,
        overlongChapters: chapters.filter(chapter => chapter.overlong).map(chapter => chapter.index),
      }
      return result
    },
  }))
}
