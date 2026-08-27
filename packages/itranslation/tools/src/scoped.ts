/**
 * Scoped file tools for pipeline subagents — the ONLY file surface a stage
 * child gets (the dispatch tool's `toolFilter` removes every generic
 * read/write/bash/search tool). Each call resolves the calling session's
 * scope file (`produce/<slug>/.scopes/<sessionId>.json`, written by the
 * dispatch tool) and refuses any path not in the step's allowlist. There is
 * no fallback and no LLM latitude: a path outside the list is a hard refusal.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readText, toolFs, writeText } from './io'
import { canonicalize, findScopeForSession } from './scope'

/** Tool output text render: show the resolved path and the file content. */
function renderRead(_args: unknown, value: { ok: boolean; path: string; content: string }): Array<{ type: 'text'; text: string }> {
  if (!value.ok) return [{ type: 'text', text: '读取被拒绝' }]
  return [{ type: 'text', text: `== ${value.path} ==\n${value.content}` }]
}

export function applyScoped(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_scoped_read',
    description: '子代理专用受限读取：只读本步骤派发时白名单内的文件（produce/<slug>/.scopes/<会话id>.json 决定清单），'
      + '白名单外的路径一律拒绝。流水线子代理只能用本工具读取分配的文件。',
    parameters: {
      file_path: {
        type: 'string',
        required: true,
        description: '要读取的文件路径（相对会话工作目录或绝对路径）；必须是本步骤白名单内的文件。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          path: { type: 'string', required: true },
          content: { type: 'string', required: true },
        },
      },
      render: renderRead,
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) {
        throw new Error('itranslation_scoped_read 只能在子代理会话中调用（无法确定调用会话）')
      }
      const scope = await findScopeForSession(io, String(sessionId))
      if (scope === undefined) {
        throw new Error(
          `未找到本子代理的文件访问范围（produce/<slug>/.scopes/${String(sessionId)}.json）：派发时未建立范围，拒绝读取`,
        )
      }
      const target = await canonicalize(io, args.file_path)
      if (!scope.read.includes(target)) {
        throw new Error(`拒绝读取：${args.file_path} 不在本步骤允许的文件清单内。本步骤允许读取：${scope.read.join('、')}`)
      }
      const content = await readText(io, target)
      return { ok: true, path: target, content }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'itranslation_scoped_write',
    description: '子代理专用受限写入：只写本步骤派发时白名单内的文件（produce/<slug>/.scopes/<会话id>.json 决定清单），'
      + '白名单外的路径一律拒绝。流水线子代理只能用本工具写分配的输出文件。',
    parameters: {
      file_path: {
        type: 'string',
        required: true,
        description: '要写入的文件路径（相对会话工作目录或绝对路径）；必须是本步骤白名单内的文件。',
      },
      content: {
        type: 'string',
        required: true,
        description: '要写入的完整文件内容。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          path: { type: 'string', required: true },
        },
      },
      render: (_args, value: { ok: boolean; path: string }) => [{
        type: 'text',
        text: value.ok ? `已写入 ${value.path}` : '写入被拒绝',
      }],
    },
    async execute(args, exec) {
      const io = toolFs(ctx, exec)
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) {
        throw new Error('itranslation_scoped_write 只能在子代理会话中调用（无法确定调用会话）')
      }
      const scope = await findScopeForSession(io, String(sessionId))
      if (scope === undefined) {
        throw new Error(
          `未找到本子代理的文件访问范围（produce/<slug>/.scopes/${String(sessionId)}.json）：派发时未建立范围，拒绝写入`,
        )
      }
      const target = await canonicalize(io, args.file_path)
      if (!scope.write.includes(target)) {
        throw new Error(`拒绝写入：${args.file_path} 不在本步骤允许写入的文件清单内。本步骤允许写入：${scope.write.join('、')}`)
      }
      await writeText(io, target, args.content)
      return { ok: true, path: target }
    },
  }))
}
