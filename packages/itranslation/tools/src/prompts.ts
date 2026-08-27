/**
 * `itranslation_prompts` — read-only exposure of the four LLM step prompts
 * (pre-read / translate / audit / revise). The settings page owns user
 * overrides under the `itranslation` namespace (registered by the client
 * package); this tool reads the resolved value through the host settings
 * service and falls back to the built-in defaults from the core package when
 * the namespace or the service is unavailable. `itranslation_dispatch` reads
 * these prompts when composing each subagent's task (D-prompts); the main
 * agent does not call this tool during the pipeline.
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

/** Copy the string prompt fields a resolved settings value carries (partial allowed). */
function pickPromptFields(value: unknown): Partial<PromptSettings> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const prompts: Partial<PromptSettings> = {}
  for (const key of PROMPT_KEYS) {
    const field = record[key]
    // A non-empty saved value wins; an empty string (cleared field) falls back
    // to the built-in default, matching the settings schema's revert intent.
    if (typeof field === 'string' && field !== '') prompts[key] = field
  }
  return Object.keys(prompts).length > 0 ? prompts : undefined
}

/**
 * Resolve the effective prompts: per-field user-saved values from the settings
 * namespace win, every unset field falls back to the built-in default. With no
 * settings row at all, all four defaults are returned.
 */
export function effectivePrompts(ctx: Context): { source: 'settings' | 'defaults'; prompts: PromptSettings } {
  try {
    const settings = (ctx as unknown as { get(name: string): unknown }).get('settings') as SettingsServiceLike | undefined
    const row = settings?.describe().find(candidate => String(candidate.ns) === PROMPT_SETTINGS_NAMESPACE)
    const overrides = pickPromptFields(row?.value)
    if (overrides !== undefined) return { source: 'settings', prompts: { ...DEFAULT_PROMPTS, ...overrides } }
  } catch {
    // settings service unavailable or namespace missing — fall through to defaults
  }
  return { source: 'defaults', prompts: { ...DEFAULT_PROMPTS } }
}

export function applyPrompts(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'itranslation_prompts',
    description: '只读：返回四个 LLM 步骤（预读/翻译/审查/修订）的附加提示词。设置页已保存值优先（命名空间 itranslation），'
      + '未设置或设置服务不可用时返回内置默认。`itranslation_dispatch` 在派发子代理时读取这些提示词并组装任务；主代理在流水线中不应调用本工具。',
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
