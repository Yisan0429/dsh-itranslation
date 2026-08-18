/**
 * `@deepseek-ai/dsh-itranslation-tools` — Host tool surface and book-level
 * state file management for the itranslation preset (D26/D58). Registers six
 * deterministic tools via `ctx.tools.register(defineTool(...))`; all file
 * effects go through `ctx.fs`, resolved against the session workspace cwd
 * (D31/D46). No LLM calls happen here (D26).
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyAlign } from './align'
import { applyAssemble } from './assemble'
import { applyGlossary } from './glossary'
import { applyPrepare } from './prepare'
import { applySegment } from './segment'
import { applyStatus } from './status'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'itranslation-tools'

/** Services this plugin hard-depends on (D58): tool registry + filesystem. */
export const inject = ['tools', 'fs']

/** Default over-long chapter budget in UTF-8 bytes (D60). */
const DEFAULT_OVERLONG_THRESHOLD_BYTES = 40000

/** Plugin config (all optional — `Config` supplies the defaults). */
export interface Config {
  /** A chapter whose source exceeds this many UTF-8 bytes is flagged over-long (D57). */
  overlongThresholdBytes?: number
}

/** Schemastery config schema with deployment-overridable defaults. */
export const Config: z<Config> = z.object({
  overlongThresholdBytes: z.number().step(1).min(1).default(DEFAULT_OVERLONG_THRESHOLD_BYTES),
})

/** Validate config even when apply is called directly outside Loader normalization. */
function resolveThreshold(config: Config): number {
  const threshold = config.overlongThresholdBytes ?? DEFAULT_OVERLONG_THRESHOLD_BYTES
  if (!Number.isSafeInteger(threshold) || threshold < 1) {
    throw new TypeError('overlongThresholdBytes must be a positive safe integer')
  }
  return threshold
}

/** Register all six deterministic itranslation tools. */
export function apply(ctx: Context, config: Config): void {
  const threshold = resolveThreshold(config)
  applyPrepare(ctx)
  applySegment(ctx, threshold)
  applyGlossary(ctx)
  applyAlign(ctx)
  applyAssemble(ctx)
  applyStatus(ctx)
}
