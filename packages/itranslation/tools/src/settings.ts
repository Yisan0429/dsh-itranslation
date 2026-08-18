/**
 * Optional settings registration for the itranslation preset (DESIGN.md §7).
 * The namespace carries the step-0 confirmation-card defaults: genre and
 * terminology-confirmation mode. Registration rides the plugin fiber, so it
 * simply stays absent when the deployment mounts no settings provider.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings namespace owned by the itranslation preset. */
export const ITRANSLATION_SETTINGS_NAMESPACE = 'itranslation'

/** Genre defaults offered by the step-0 confirmation card. */
const ITRANSLATION_GENRE_VALUES = ['auto', 'fiction', 'non-fiction', 'technical', 'children', 'other'] as const

type ItranslationGenre = typeof ITRANSLATION_GENRE_VALUES[number]

type ItranslationTerminologyMode = 'auto' | 'manual'

/** Durable section shared by the host schema and the browser settings page. */
interface ItranslationSettings {
  genre: ItranslationGenre
  terminologyMode: ItranslationTerminologyMode
}

/** Schemastery schema; defaults match the client's built-in fallbacks. */
export const ItranslationSettingsSchema: z<ItranslationSettings> = z.object({
  genre: z.union([...ITRANSLATION_GENRE_VALUES] as const).default('auto'),
  terminologyMode: z.union(['auto', 'manual'] as const).default('auto'),
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
