/**
 * `itranslation_status` — read-only progress and evidence summary over the
 * book directory (DESIGN.md §5.4/§5.5): which artifacts exist, how many
 * chapters are translated, and a coarse workflow phase.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { fragmentNumbers } from './chapters'
import { isDirectory, isFile, listDirNames, renderJson, toolFs } from './io'
import { alignedRel, auditRel, bookDirRel, chaptersDirRel, glossaryRel, metaRel, outputRel, stateRel, styleRel } from './paths'
import { readState } from './state'
import type { BookPhase, StatusResult } from './types'

const SOURCE_DIR = 'source'

/** Count source files in `books/<slug>/source/`. */
function countMd(names: readonly string[]): number {
  return names.filter(name => name.endsWith('.md')).length
}

/** Count distinct translated chapter indices across single files and fragments. */
function translatedCount(names: readonly string[], totalChapters: number): number {
  let count = 0
  for (let index = 1; index <= totalChapters; index += 1) {
    if (names.includes(`${index}.md`) || fragmentNumbers(names, index).length > 0) count += 1
  }
  return count
}

/** Derive the coarse phase from observed artifacts (priority: assembled > audited > aligned > translating > prepared). */
function derivePhase(state: boolean, aligned: boolean, audit: boolean, meta: boolean, translated: number): BookPhase {
  if (meta) return 'assembled'
  if (audit) return 'audited'
  if (aligned) return 'aligned'
  if (translated > 0) return 'translating'
  if (state) return 'prepared'
  return 'none'
}

export function applyStatus(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_status',
    description: '只读进度与证据摘要：列出书目目录下的产物存在性、已译章数与工作阶段。可随时调用。',
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
          slug: { type: 'string', required: true },
          bookDir: { type: 'string', required: true },
          exists: { type: 'boolean', required: true },
          totalChapters: { type: 'integer', required: true },
          sourceChapters: { type: 'integer', required: true },
          translatedChapters: { type: 'integer', required: true },
          artifacts: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              state: { type: 'boolean', required: true },
              glossary: { type: 'boolean', required: true },
              style: { type: 'boolean', required: true },
              audit: { type: 'boolean', required: true },
              aligned: { type: 'boolean', required: true },
              meta: { type: 'boolean', required: true },
              output: { type: 'boolean', required: true },
            },
          },
          phase: {
            type: 'string',
            required: true,
            enum: ['none', 'prepared', 'translating', 'aligned', 'audited', 'assembled'],
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      const bookDir = bookDirRel(args.slug)
      const exists = await isDirectory(io, bookDir)

      const result: StatusResult = {
        slug: args.slug,
        bookDir,
        exists,
        totalChapters: 0,
        sourceChapters: 0,
        translatedChapters: 0,
        artifacts: {
          state: false,
          glossary: false,
          style: false,
          audit: false,
          aligned: false,
          meta: false,
          output: false,
        },
        phase: 'none',
      }

      if (!exists) return result

      result.artifacts = {
        state: await isFile(io, stateRel(args.slug)),
        glossary: await isFile(io, glossaryRel(args.slug)),
        style: await isFile(io, styleRel(args.slug)),
        audit: await isFile(io, auditRel(args.slug)),
        aligned: await isFile(io, alignedRel(args.slug)),
        meta: await isFile(io, metaRel(args.slug)),
        output: await isFile(io, outputRel(args.slug)),
      }

      if (result.artifacts.state) {
        result.totalChapters = (await readState(io, args.slug)).chapters.length
      }

      result.sourceChapters = countMd(await listDirNames(io, `${bookDir}/${SOURCE_DIR}`))
      const chapterNames = await listDirNames(io, chaptersDirRel(args.slug))
      result.translatedChapters = translatedCount(chapterNames, result.totalChapters)
      result.phase = derivePhase(
        result.artifacts.state,
        result.artifacts.aligned,
        result.artifacts.audit,
        result.artifacts.meta,
        result.translatedChapters,
      )
      return result
    },
  }))
}
