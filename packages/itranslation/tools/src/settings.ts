/**
 * Optional settings registration for the itranslation preset (DESIGN.md §7).
 * The namespace carries the four LLM prompt templates the preset's agent
 * reads when it runs pre-reading, translation, audit, and revision. The
 * settings page edits them; the host tools only register the schema and
 * defaults. Registration rides the plugin fiber, so it simply stays absent
 * when the deployment mounts no settings provider.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings namespace owned by the itranslation preset. */
export const ITRANSLATION_SETTINGS_NAMESPACE = 'itranslation'

/** The four LLM prompts editable from the settings page. */
interface ItranslationSettings {
  preReadPrompt: string
  translatePrompt: string
  auditPrompt: string
  revisePrompt: string
}

/** Empty by design: the settings page provides blank textareas; users fill their own prompts. */
export const ItranslationSettingsSchema: z<ItranslationSettings> = z.object({
  preReadPrompt: z.string().default(''),
  translatePrompt: z.string().default(''),
  auditPrompt: z.string().default(''),
  revisePrompt: z.string().default(''),
})

/**
 * Register `itranslation` when a settings provider exists.
 * @param ctx - tools plugin context.
 */
export function applySettings(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(ITRANSLATION_SETTINGS_NAMESPACE), ItranslationSettingsSchema)
  })
}
