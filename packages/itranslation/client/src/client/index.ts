/**
 * Browser bundle entry of the itranslation client UI package (DESIGN.md §7).
 * It registers one keyed toolview per deterministic `itranslation.*` tool
 * (the Run card progress surface) and one `settings.section` page for the
 * four LLM prompt templates (pre-reading, translation, audit, revision).
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the keyed `tool.call.toolview` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the `settings.section` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { ITRANSLATION_TOOL_NAMES } from './model'
import { isSettingsApi, ItranslationSettingsController, type SettingsApi } from './settings-store'
import { ItranslationSettingsSection } from './settings-section'
import { ItranslationToolView } from './tool-view'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'itranslation-client'

/** Services this plugin hard-depends on: slot registry + connection wire. */
export const inject = ['slots', 'connection']

/** Extract the settings API slice from a connection service value. */
function connectionSettings(value: unknown): SettingsApi | null {
  if (typeof value !== 'object' || value === null || !('api' in value)) return null
  const api = value.api
  return isSettingsApi(api) ? api : null
}

/**
 * Register the six deterministic tool rows and the settings section.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const toolName of ITRANSLATION_TOOL_NAMES) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, ItranslationToolView)
    }
  })

  const api = connectionSettings(ctx.get('connection'))
  if (api === null) throw new Error('itranslation-client: connection.settings service is unavailable')
  const controller = new ItranslationSettingsController(api)
  const injected = {
    useSnapshot: bindSnapshotSelector(controller.store),
    load: controller.load,
    setPreReadPrompt: controller.setPreReadPrompt,
    setTranslatePrompt: controller.setTranslatePrompt,
    setAuditPrompt: controller.setAuditPrompt,
    setRevisePrompt: controller.setRevisePrompt,
    save: controller.save,
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'itranslation',
    order: 30,
    label: 'Itranslation',
    inject: () => injected,
  }, ItranslationSettingsSection))
}
