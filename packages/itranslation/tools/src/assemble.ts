/**
 * `itranslation.assemble` — deterministic final output + evidence chain
 * (DESIGN.md §3 step 8): requires `state.json`, `chapters/`, and
 * `audit-report.md` (D38), re-assembles from current chapters, and writes the
 * final Markdown (`<slug>.md`) plus `meta.json` (D34).
 */

import type { Context } from '@deepseek-ai/cordis'
import { engineVersion, segmentParagraphs } from '@deepseek-ai/dsh-itranslation-core'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assembleBookOrMismatch, readAssemblyInputs } from './assembly'
import { isFile, renderJson, toolFs, writeJson, writeText } from './io'
import { auditRel, bookDirRel, metaRel, outputRel } from './paths'
import { readState } from './state'
import { mismatchSchema } from './schema'
import type { AssembleResult, MetaFile } from './types'

/** `meta.json` schema version (bump on breaking shape changes). */
const META_SCHEMA_VERSION = 1

export function applyAssemble(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation.assemble',
    description: '确定性出成品 + 证据链：须 state.json、chapters/、audit-report.md 齐全（D38），'
      + '重组装全书并写成品 <slug>.md 与 meta.json（可选 processes 记录各 LLM 过程）。段数失配返回结构化 ok:false。',
    parameters: {
      slug: {
        type: 'string',
        required: true,
        description: '书目 slug（itranslation.prepare 返回的 slug）。',
      },
      processes: {
        type: 'array',
        description: '可选：各 LLM 过程的证据记录（模型/起止/用量），写入 meta.json（D29/D34）。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            step: { type: 'string', required: true },
            model: { type: 'string' },
            startedAt: { type: 'string' },
            finishedAt: { type: 'string' },
            tokenUsage: {
              type: 'object',
              additionalProperties: false,
              properties: {
                input: { type: 'integer' },
                output: { type: 'integer' },
              },
            },
            notes: { type: 'string' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          slug: { type: 'string', required: true },
          outputFile: { type: 'string' },
          metaFile: { type: 'string' },
          chapterCount: { type: 'integer' },
          mismatch: mismatchSchema,
          message: { type: 'string' },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      const state = await readState(io, args.slug)

      if (!(await isFile(io, auditRel(args.slug)))) {
        throw new Error(
          `第 6 步审查报告缺失（${auditRel(args.slug)}）：请先完成全书审查并落盘 audit-report.md（D38）`,
        )
      }

      const { sources, translations } = await readAssemblyInputs(io, args.slug, state)
      const chapters: MetaFile['chapters'] = state.chapters.map((chapter, index) => ({
        index: chapter.index,
        title: chapter.title,
        paragraphs: segmentParagraphs(sources[index] as string).length,
      }))

      const outcome = assembleBookOrMismatch(state, sources, translations)
      if (!outcome.ok) {
        const result: AssembleResult = { ok: false, slug: args.slug, mismatch: outcome.mismatch, message: outcome.message }
        return result
      }

      const outputFile = outputRel(args.slug)
      await writeText(io, outputFile, outcome.markdown)

      const meta: MetaFile = {
        schemaVersion: META_SCHEMA_VERSION,
        engineVersion,
        title: state.title,
        slug: args.slug,
        bookDir: bookDirRel(args.slug),
        chapters,
        outputFile,
        assembledAt: new Date().toISOString(),
        processes: args.processes ?? [],
      }
      await writeJson(io, metaRel(args.slug), meta)

      const result: AssembleResult = {
        ok: true,
        slug: args.slug,
        outputFile,
        metaFile: metaRel(args.slug),
        chapterCount: chapters.length,
      }
      return result
    },
  }))
}
