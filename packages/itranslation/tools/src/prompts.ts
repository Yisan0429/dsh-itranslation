/**
 * `itranslation_prompts` — read-only exposure of the four LLM step prompts
 * (pre-read / translate / audit / revise). The settings page owns user
 * overrides under the `itranslation` namespace (registered by the client
 * package); this tool reads the resolved value through the host settings
 * service and falls back to the built-in defaults from the core package when
 * the namespace or the service is unavailable. The main agent appends the
 * step prompt to each subagent's task description (D-prompts).
 */

import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_PROMPTS } from '@deepseek-ai/dsh-itranslation-core'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { renderJson } from './io'

/** Settings namespace owned by the itranslation preset (mirrors the client constant). */
const PROMPT_SETTINGS_NAMESPACE = 'itranslation'

/** The four prompt fields as the settings schema (and this tool) carry them. */
export interface PromptSettings {
  preReadPrompt: string
  translatePrompt: string
  auditPrompt: string
  revisePrompt: string
}

/** The slice of the host settings service this tool reaches structurally. */
interface SettingsServiceLike {
  describe(options?: { redactSecrets?: boolean }): ReadonlyArray<{ ns: unknown; value: unknown }>
}

const PROMPT_KEYS = ['preReadPrompt', 'translatePrompt', 'auditPrompt', 'revisePrompt'] as const

/** Copy exactly the four prompt fields from a resolved settings value. */
function pickPromptFields(value: unknown): PromptSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const prompts: Partial<PromptSettings> = {}
  for (const key of PROMPT_KEYS) {
    const field = record[key]
    if (typeof field !== 'string') return undefined
    prompts[key] = field
  }
  return prompts as PromptSettings
}

/** Resolve the effective prompts: settings namespace first, built-in defaults otherwise. */
export function effectivePrompts(ctx: Context): { source: 'settings' | 'defaults'; prompts: PromptSettings } {
  try {
    const settings = (ctx as unknown as { get(name: string): unknown }).get('settings') as SettingsServiceLike | undefined
    const row = settings?.describe().find(candidate => String(candidate.ns) === PROMPT_SETTINGS_NAMESPACE)
    const prompts = pickPromptFields(row?.value)
    if (prompts !== undefined) return { source: 'settings', prompts }
  } catch {
    // settings service unavailable or namespace missing — fall through to defaults
  }
  return { source: 'defaults', prompts: { ...DEFAULT_PROMPTS } }
}

export function applyPrompts(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_prompts',
    description: '只读：返回四个 LLM 步骤（预读/翻译/审查/修订）的附加提示词。设置页已保存值优先（命名空间 itranslation），'
      + '未设置或设置服务不可用时返回内置默认。主代理派发子代理时，把对应步骤的提示词附加到子代理任务说明末尾。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          source: { type: 'string', required: true, enum: ['settings', 'defaults'] },
          prompts: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              preReadPrompt: { type: 'string', required: true },
              translatePrompt: { type: 'string', required: true },
              auditPrompt: { type: 'string', required: true },
              revisePrompt: { type: 'string', required: true },
            },
          },
        },
      },
      render: renderJson,
    },
    execute() {
      const effective = effectivePrompts(ctx)
      return Promise.resolve({ ok: true, source: effective.source, prompts: effective.prompts })
    },
  }))
}
