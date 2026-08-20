/**
 * Host-side settings registration for the itranslation settings page (D68).
 * The namespace carries the four LLM prompt templates the preset's agent
 * reads for pre-reading, translation, audit, and revision. Ownership lives in
 * the client package's Host half — the package is mounted in the web plane
 * (cordis.patch.yml), so the namespace is registered for the web Host's
 * settings service permanently, independent of any agent session. The tools
 * package deliberately does NOT register it (D62 amended): both planes share
 * the host-root settings instance, and a duplicate registration would fail
 * loud when an itranslation session mounts the tools package. Registration
 * rides the plugin fiber, so it simply stays absent when the deployment
 * mounts no settings provider.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings namespace owned by the itranslation preset (mirrors the browser-side store constant). */
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
 * @param ctx - client package Host-half context (web plane).
 */
export function applySettings(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(ITRANSLATION_SETTINGS_NAMESPACE), ItranslationSettingsSchema)
  })
}
