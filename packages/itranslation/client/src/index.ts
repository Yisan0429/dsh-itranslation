/**
 * Host-side node entry of the itranslation client UI package (D17). As the
 * host Loader entry of the web-plane plugin, it owns the `itranslation`
 * settings namespace registration (D68) and the plugin-owned settings route
 * the browser page reads/writes through (D69); the browser bundle lives under
 * src/client, and `dsh.client` in package.json drives its registration.
 */
import type { Context } from '@deepseek-ai/cordis'
import { applySettings } from './settings'
import { applyWebSettings } from './web-settings'

export const clientNodeEntry = 'itranslation-client-node' as const

/** Host loader apply: register the settings namespace and its web route. */
export function apply(ctx: Context): void {
  applySettings(ctx)
  applyWebSettings(ctx)
}
