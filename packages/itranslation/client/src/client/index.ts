/**
 * Browser bundle entry of the itranslation client UI package (DESIGN.md §7).
 * It registers one keyed toolview per deterministic `itranslation_*` tool
 * (the Run card progress surface) and the settings page for the four LLM
 * prompt templates. Mirrors the harness `ui-settings-models` registration
 * shape: locale dictionaries, `settings.section` slot injection, and an
 * inject face carrying controller/useSnapshot/t.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
// Type-only: pulls the keyed `tool.call.toolview` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the `settings.section` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ITRANSLATION_TOOL_NAMES } from './model'
import { createItranslationSettingsApi, ItranslationSettingsController } from './settings-store'
import type { ItranslationSettingsInjected } from './settings-section'
import { ItranslationSettingsSection } from './settings-section'
import { en, zh, type SettingsKey } from './settings-locales'
import { ItranslationToolView } from './tool-view'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'itranslation-client'

/** Services this plugin hard-depends on. */
export const inject = ['slots', 'locale', 'connection']

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.itranslation'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The itranslation settings page copy. */
    'settings.itranslation': SettingsKey
  }
}

/**
 * Register the six deterministic tool rows and the settings section.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'itranslation-client: dictionaries')

  ctx.slots.inject('tool.call.toolview', function* () {
    for (const toolName of ITRANSLATION_TOOL_NAMES) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, ItranslationToolView)
    }
  })

  // The page reaches the Host namespace through the plugin-owned settings
  // route (D69): the browser settings wire only serves allowlisted namespaces.
  const controller = new ItranslationSettingsController(createItranslationSettingsApi())
  const useSnapshot = bindSnapshotSelector(controller.store)
  const t = ctx.locale.bind(NS) as ItranslationSettingsInjected['t']
  const injected = (): ItranslationSettingsInjected => ({
    controller,
    useSnapshot,
    t,
  })

  ctx.effect(() => ctx.on('connection/reset', () => {
    if (controller.store.getSnapshot().status !== 'idle') void controller.load()
  }), 'itranslation-client: settings refresh on connection reset')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'itranslation',
    order: 30,
    label: () => t('nav'),
    inject: injected,
  }, ItranslationSettingsSection))
}
