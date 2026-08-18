/**
 * `itranslation.prepare` — deterministic book intake (DESIGN.md §3 step 1):
 * read E2M-produced Markdown, detect `##` chapters (D56), and land the
 * cleaned source backups (`source/<n>.md`) plus `state.json`. Refuses to
 * overwrite an already-prepared book (D36: no cross-session auto-recovery).
 */

import type { Context } from '@deepseek-ai/cordis'
import { detectChapters } from '@deepseek-ai/dsh-itranslation-core'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { isFile, readText, renderJson, toolFs, writeJson, writeText } from './io'
import { bookDirRel, bookSlug, sourceRel, stateRel, titleFromPath } from './paths'
import { chapterSummarySchema } from './schema'
import type { ChapterSummary, PrepareResult } from './types'

/** Resolve the book title from the optional argument, else the file name (D56). */
function resolveTitle(explicit: string | undefined, path: string): string {
  const title = (explicit ?? titleFromPath(path)).trim()
  if (title === '') {
    throw new Error('书名缺失：请提供 title 参数，或使用带文件名的 Markdown 路径（D56）')
  }
  return title
}

export function applyPrepare(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation.prepare',
    description: '一本书的确定性录入：读取 E2M 转出的 Markdown，识别 `##` 章边界，'
      + '落盘清理后的原文备份 source/<n>.md 与章结构 state.json。已准备过的书会拒绝覆盖。',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'E2M 转出的 Markdown 文件路径（相对会话工作目录或绝对路径）。',
      },
      title: {
        type: 'string',
        description: '书名；缺省时取自文件名（D56）。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slug: { type: 'string', required: true },
          bookDir: { type: 'string', required: true },
          title: { type: 'string', required: true },
          chapters: chapterSummarySchema,
          sourceFiles: {
            type: 'array',
            required: true,
            items: { type: 'string' },
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      const title = resolveTitle(args.title, args.path)
      const slug = bookSlug(title)

      if (await isFile(io, stateRel(slug))) {
        throw new Error(
          `书「${title}」已准备过（${stateRel(slug)} 已存在）：跨会话不自动恢复，请回到原会话继续，或换新书名重交（D36）`,
        )
      }

      const markdown = await readText(io, args.path)
      const chapters = detectChapters(markdown)

      const sourceFiles: string[] = []
      for (const chapter of chapters) {
        const path = sourceRel(slug, chapter.index)
        await writeText(io, path, chapter.body)
        sourceFiles.push(path)
      }

      const summaries: ChapterSummary[] = chapters.map(chapter => ({
        index: chapter.index,
        title: chapter.title,
      }))
      await writeJson(io, stateRel(slug), { title, chapters: summaries })

      const result: PrepareResult = {
        slug,
        bookDir: bookDirRel(slug),
        title,
        chapters: summaries,
        sourceFiles,
      }
      return result
    },
  }))
}
