/**
 * `itranslation_align` — deterministic chapter assembly + validation
 * (DESIGN.md §3 step 5): read source backups and translated chapters
 * (including `<n>.<k>.md` fragments, D48), run core `assembleBook`, and write
 * the `aligned.md` preview. A paragraph/chapter-count mismatch is returned as
 * a structured `ok: false` result rather than thrown (D56).
 */

import type { Context } from '@deepseek-ai/cordis'
import { segmentParagraphs } from '@yisan0429/dsh-itranslation-core'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assembleBookOrMismatch, readAssemblyInputs, readTitleTranslations } from './assembly'
import { renderJson, toolFs, writeText } from './io'
import { alignedRel } from './paths'
import { readState } from './state'
import { mismatchSchema } from './schema'
import type { AlignChapter, AlignResult } from './types'

export function applyAlign(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_align',
    description: '确定性组装校验：读 source/<n>.md 与 chapters/<n>.md（含分片）→ 按空行比对段数并组装，'
      + '写 aligned.md 预览；段数失配返回结构化 ok:false 由你转问用户（D56）。须先 itranslation_prepare。',
    parameters: {
      slug: {
        type: 'string',
        required: true,
        description: '书目 slug（itranslation_prepare 返回的 slug）。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          slug: { type: 'string', required: true },
          alignedFile: { type: 'string' },
          chapters: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'integer', required: true },
                title: { type: 'string', required: true },
                sourceParagraphs: { type: 'integer', required: true },
                translationParagraphs: { type: 'integer', required: true },
              },
            },
          },
          mismatch: mismatchSchema,
          message: { type: 'string' },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      const state = await readState(io, args.slug)

      const { sources, translations } = await readAssemblyInputs(io, args.slug, state)
      const titleTranslations = await readTitleTranslations(io, args.slug)
      const chapters: AlignChapter[] = state.chapters.map((chapter, index) => ({
        index: chapter.index,
        title: chapter.title,
        sourceParagraphs: segmentParagraphs(sources[index] as string).length,
        translationParagraphs: segmentParagraphs(translations[index] as string).length,
      }))

      const outcome = assembleBookOrMismatch(state, sources, translations, titleTranslations)
      if (!outcome.ok) {
        const result: AlignResult = { ok: false, slug: args.slug, chapters: [], mismatch: outcome.mismatch, message: outcome.message }
        return result
      }

      await writeText(io, alignedRel(args.slug), outcome.markdown)
      const result: AlignResult = {
        ok: true,
        slug: args.slug,
        alignedFile: alignedRel(args.slug),
        chapters,
      }
      return result
    },
  }))
}
