/**
 * `itranslation_prepare` — deterministic book intake (DESIGN.md §3 step 1):
 * read E2M-produced Markdown from the user's `input/` folder (D70), detect
 * `##` chapters (D56), and land the cleaned source backups (`source/<n>.md`)
 * plus `state.json`. Refuses to overwrite an already-prepared book (D36: no
 * cross-session auto-recovery).
 */

import type { Context } from '@deepseek-ai/cordis'
import { detectChapters } from '@yisan0429/dsh-itranslation-core'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { isFile, listDirNames, readText, renderJson, toolFs, writeJson, writeText, type ToolFsContext } from './io'
import { readItranslationConfig } from './config'
import { bookDirRel, bookSlug, inputDirRel, sourceRel, stateRel, titleFromPath } from './paths'
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

/**
 * Resolve the input Markdown: an explicit `path` wins; otherwise auto-discover
 * the single `.md` under `input/`. Zero or several candidates is a loud error —
 * the caller reports it and the user tidies `input/` (D-fully-automatic intake).
 */
async function resolveInputPath(io: ToolFsContext, explicit: string | undefined): Promise<string> {
  if (explicit !== undefined && explicit !== '') return explicit
  const entries = await listDirNames(io, inputDirRel())
  const candidates = entries.filter(name => name.endsWith('.md'))
  if (candidates.length === 0) {
    throw new Error(`input/ 下没有 Markdown 书稿：请先把 E2M 转出的书放入 ${inputDirRel()}/ 再重试`)
  }
  if (candidates.length > 1) {
    throw new Error(`input/ 下有多个候选（${candidates.join('、')}），无法自动确定：请只留一本，或显式传 path`)
  }
  return `${inputDirRel()}/${candidates[0] as string}`
}

export function applyPrepare(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_prepare',
    description: '一本书的确定性录入：读取 ./input/ 下 E2M 转出的 Markdown（缺省自动发现 input/ 下唯一的 .md 文件，'
      + '也可显式传 path），识别 `##` 章边界，落盘清理后的原文备份 source/<n>.md 与章结构 state.json。'
      + '已准备过的书会拒绝覆盖。',
    parameters: {
      path: {
        type: 'string',
        description: '位于 ./input/ 的 E2M 转出 Markdown 文件路径（相对会话工作目录或绝对路径，D70）；缺省自动发现。',
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
      const config = readItranslationConfig(ctx)
      const inputPath = await resolveInputPath(io, args.path ?? config.inputFile)
      const title = resolveTitle(args.title, inputPath)
      const slug = bookSlug(title)

      if (await isFile(io, stateRel(slug))) {
        throw new Error(
          `书「${title}」已准备过（${stateRel(slug)} 已存在）：跨会话不自动恢复，请回到原会话继续，或换新书名重交（D36）`,
        )
      }

      const markdown = await readText(io, inputPath)
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
      await writeJson(io, stateRel(slug), { title, chapters: summaries, inputPath })

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
