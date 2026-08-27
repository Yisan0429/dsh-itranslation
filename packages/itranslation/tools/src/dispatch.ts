/**
 * `itranslation_dispatch` — deterministic subagent dispatch (D-…): builds the
 * subagent task text from the built-in default prompts AND starts the run
 * through `ctx.subagents` (continuable, background). The main agent only calls
 * this tool and waits for the completion notice — it never writes prompt text
 * and never touches the subagent/send_message tools itself.
 *
 * - pre-read / translate / audit: `startContinuable` (spawn provider), returns
 *   the durable child id.
 * - revise: `followup` on the audit child (the caller passes its childId);
 *   the message starts with "Revise: " so the evidence chain records the step.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readItranslationConfig } from './config'
import { toolFs } from './io'
import { auditRel, bookDirRel, chapterRel, glossaryRel, sourceRel } from './paths'
import { effectivePrompts } from './prompts'
import { canonicalize, writeScope, type ChildScope } from './scope'
import { readState } from './state'
import type { DispatchResult } from './types'

/** The pipeline steps this tool can dispatch. */
export type DispatchStep = DispatchResult['step']

/** Fixed report-field line per step — the only report the subagent may give. */
const REPORT_FIELDS: Record<DispatchStep, string> = {
  'pre-read': '产物路径（glossary.json/analysis.md）与术语表条目数',
  translate: 'chapters/<n>.md 的绝对路径与段落数',
  audit: 'audit-report.md 的绝对路径与各维度问题条数概览',
  revise: '逐条改动说明（条目→改动文件→是否涉及术语表）与 glossary.json 最终条目数',
}

/** Replace ONLY the path placeholders the fixed prompts carry; nothing else. */
function substitutePaths(text: string, paths: { input?: string; source?: string; chapter?: string }): string {
  let out = text
  if (paths.input !== undefined) out = out.replaceAll('input/<file>.md', paths.input)
  if (paths.source !== undefined) out = out.replaceAll('source/<n>.md', paths.source)
  if (paths.chapter !== undefined) out = out.replaceAll('chapters/<n>.md', paths.chapter)
  return out
}

/** A minimal structural view of the host `subagents` service (no hard dependency). */
interface SubagentsServiceLike {
  startContinuable(spec: {
    provider: string
    label: string
    request: {
      label: string
      prompt: Array<{ type: 'text'; text: string }>
      parent: unknown
      toolFilter?: { allow?: readonly string[]; deny?: readonly string[] }
    }
    signal: AbortSignal
  }): Promise<{ childId: string; messageId: unknown }>
  followup(
    parent: unknown,
    childId: string,
    content: Array<{ type: 'text'; text: string }>,
    options: { source: { kind: string; form: string; senderSessionId: unknown }; signal: AbortSignal },
  ): Promise<unknown>
}

/** The spawn provider this preset's delegation tools run on. */
const SPAWN_PROVIDER = 'spawn'

/**
 * Per-step child tool surface: the ONLY tools a stage child sees. Everything
 * else — bash, read/write/edit, glob/grep, skills, jobs, ssh, the other
 * pipeline tools, ask-user, todo — is removed by the allow-list, so a child
 * physically cannot read or write anything outside its scope.
 */
const STEP_TOOL_FILTER: Record<Exclude<DispatchStep, 'revise'>, { allow: readonly string[] }> = {
  'pre-read': { allow: ['itranslation_scoped_read', 'itranslation_scoped_write', 'itranslation_glossary'] },
  translate: { allow: ['itranslation_scoped_read', 'itranslation_scoped_write'] },
  audit: { allow: ['itranslation_scoped_read', 'itranslation_scoped_write', 'itranslation_glossary'] },
}

/** Resolve one canonical absolute path for the child's scope file. */
function scopePath(io: ReturnType<typeof toolFs>, rel: string): Promise<string> {
  return canonicalize(io, rel)
}

export function applyDispatch(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_dispatch',
    description: '确定性派发流水线子代理：按步骤（pre-read/translate/audit/revise）从内置默认提示词组装任务并直接经 subagents 服务'
      + '后台启动（continuable），返回子代理 id；子代理完成时宿主会发通知。revise 步骤对已派发的审计子代理（childId）续发修订消息。'
      + '主代理只调用本工具并等待通知，不撰写任何提示词，不使用 subagent/send_message 工具。',
    parameters: {
      slug: {
        type: 'string',
        required: true,
        description: '书目 slug（itranslation_prepare 返回的 slug）。',
      },
      step: {
        type: 'string',
        required: true,
        enum: ['pre-read', 'translate', 'audit', 'revise'],
        description: '流水线步骤。',
      },
      language: {
        type: 'string',
        description: '目标语言（缺省取设置页 itranslation.targetLanguage，再缺省「简体中文」）。',
      },
      chapter: {
        type: 'integer',
        description: 'translate 步骤的章号（1-based，该步骤必填）。',
      },
      childId: {
        type: 'string',
        description: 'revise 步骤必填：审计子代理的 id（audit 派发返回的 subagentId）。',
      },
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true, const: true },
              step: { type: 'string', required: true },
              subagentId: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true, const: true },
              step: { type: 'string', required: true, const: 'revise' },
              messageId: { type: 'string', required: true },
            },
          },
        ],
      },
      render: (args, value: { ok: boolean; step: string; subagentId?: string; messageId?: string }) => [{
        type: 'text',
        text: value.subagentId !== undefined
          ? `started ${args.step} subagent ${value.subagentId}`
          : `revise message ${value.messageId} queued for subagent ${String(args.childId)}`,
      }],
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) {
        throw new Error('itranslation_dispatch requires a calling agent (exec.agent was undefined)')
      }
      const io = toolFs(ctx, exec)
      const step = args.step
      const language = args.language ?? readItranslationConfig(ctx).targetLanguage
      // User-saved prompts win; the built-in defaults back them up (one
      // resolution, same as itranslation_prompts).
      const prompts = effectivePrompts(ctx).prompts
      const subagents = (ctx as unknown as { get(name: string): unknown }).get('subagents') as SubagentsServiceLike | undefined
      if (subagents === undefined) {
        throw new Error('subagents 服务不可用：无法派发子代理')
      }

      if (step === 'revise') {
        const childId = args.childId
        if (childId === undefined || childId === '') {
          throw new Error('revise 派发需要 childId（审计子代理的 id，audit 派发返回的 subagentId）')
        }
        const message = `Revise: ${prompts.revisePrompt}\n\n`
          + `目标语言：${language}。\n输入/输出：修订写回 chapters/<n>.md（保持段落数一致），涉及术语时先更新 `
          + `${glossaryRel(args.slug)}；审计报告为 ${auditRel(args.slug)}。`
          + `\n\n完成后只报告固定字段：${REPORT_FIELDS.revise}。`
        const messageId = await subagents.followup(
          parent,
          childId,
          [{ type: 'text', text: message }],
          {
            source: { kind: 'coordinator', form: 'relay', senderSessionId: parent.id },
            signal: exec.signal,
          },
        )
        return { ok: true, step, messageId: String(messageId) }
      }

      const state = await readState(io, args.slug)
      let label: string
      let prompt: string
      let scope: ChildScope
      if (step === 'pre-read') {
        const input = state.inputPath
        if (input === undefined || input === '') {
          throw new Error('pre-read 派发需要 inputPath：state.json 未记录原始输入路径，请重新 itranslation_prepare')
        }
        label = `Pre-read: ${args.slug}`
        const header = `目标语言：${language}。\n输入：${input}；输出：${glossaryRel(args.slug)}、${bookDirRel(args.slug)}/analysis.md。`
        prompt = `${header}\n\n${substitutePaths(prompts.preReadPrompt, { input })}`
          + `\n\n完成后只报告固定字段：${REPORT_FIELDS['pre-read']}。`
        scope = {
          step,
          slug: args.slug,
          read: [await scopePath(io, input)],
          write: [
            await scopePath(io, glossaryRel(args.slug)),
            await scopePath(io, `${bookDirRel(args.slug)}/analysis.md`),
          ],
        }
      } else if (step === 'translate') {
        const chapter = args.chapter
        if (chapter === undefined || !Number.isInteger(chapter)) {
          throw new Error('translate 派发需要 chapter 章号（1-based）')
        }
        if (!state.chapters.some(candidate => candidate.index === chapter)) {
          throw new Error(`书「${args.slug}」没有第 ${chapter} 章`)
        }
        label = `Translate chapter ${chapter}: ${args.slug}`
        const source = sourceRel(args.slug, chapter)
        const output = chapterRel(args.slug, chapter)
        const header = `目标语言：${language}。\n输入：${bookDirRel(args.slug)}/analysis.md、${glossaryRel(args.slug)}、${source}；输出：${output}。`
        prompt = `${header}\n\n${substitutePaths(prompts.translatePrompt, { source, chapter: output })}`
          + `\n\n完成后只报告固定字段：${REPORT_FIELDS.translate}。`
        scope = {
          step,
          slug: args.slug,
          chapter,
          read: [
            await scopePath(io, `${bookDirRel(args.slug)}/analysis.md`),
            await scopePath(io, glossaryRel(args.slug)),
            await scopePath(io, source),
          ],
          write: [await scopePath(io, output)],
        }
      } else {
        label = `Audit: ${args.slug}`
        const sources = state.chapters.map(chapter => sourceRel(args.slug, chapter.index)).join('、')
        const chapters = state.chapters.map(chapter => chapterRel(args.slug, chapter.index)).join('、')
        const header = `目标语言：${language}。\n输入：${sources}（对照 ${chapters}），另读 ${glossaryRel(args.slug)}、`
          + `${bookDirRel(args.slug)}/analysis.md；输出：${auditRel(args.slug)}。`
        prompt = `${header}\n\n${prompts.auditPrompt}\n\n完成后只报告固定字段：${REPORT_FIELDS.audit}。`
        // The audit child also carries the later revise pass: its scope must
        // let it rewrite chapters/<n>.md and re-read its own report.
        scope = {
          step,
          slug: args.slug,
          read: await Promise.all([
            ...state.chapters.flatMap(chapter => [sourceRel(args.slug, chapter.index), chapterRel(args.slug, chapter.index)]),
            glossaryRel(args.slug),
            `${bookDirRel(args.slug)}/analysis.md`,
            auditRel(args.slug),
          ].map(rel => scopePath(io, rel))),
          write: await Promise.all([
            auditRel(args.slug),
            ...state.chapters.map(chapter => chapterRel(args.slug, chapter.index)),
          ].map(rel => scopePath(io, rel))),
        }
      }

      const started = await subagents.startContinuable({
        provider: SPAWN_PROVIDER,
        label,
        request: {
          label,
          prompt: [{ type: 'text', text: prompt }],
          parent,
          toolFilter: STEP_TOOL_FILTER[step],
        },
        signal: exec.signal,
      })
      // Persist the child's access scope before the dispatch returns: the
      // child's first tool call happens at least one full turn later, so the
      // scope file is in place well before the scoped tools consult it.
      await writeScope(io, args.slug, started.childId, scope)
      return { ok: true, step, subagentId: started.childId }
    },
  }))
}
