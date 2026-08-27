/**
 * Read the `itranslation` settings namespace for the automatic pipeline
 * configuration: the target language and the input book file. Falls back to
 * built-ins (`简体中文` / auto-discover) when the settings service or the
 * namespace row is absent — the same structural access pattern as
 * `effectivePrompts` in prompts.ts.
 */

/** Settings namespace owned by the itranslation preset (mirrors the client constant). */
const ITRANSLATION_SETTINGS_NAMESPACE = 'itranslation'

/** The slice of the host settings service this module reads structurally. */
interface SettingsServiceLike {
  describe(options?: { redactSecrets?: boolean }): ReadonlyArray<{ ns: unknown; value: unknown }>
}

/** The automatic pipeline configuration resolved from settings. */
export interface ItranslationConfig {
  /** Target language for the run; never empty (falls back to 简体中文). */
  targetLanguage: string
  /** `input/<file>.md` chosen in the settings page; absent = auto-discover. */
  inputFile?: string
}

/** Resolve targetLanguage / inputFile from the settings namespace with built-in fallbacks. */
export function readItranslationConfig(ctx: unknown): ItranslationConfig {
  try {
    const settings = (ctx as { get?(name: string): unknown }).get?.('settings') as SettingsServiceLike | undefined
    const row = settings?.describe().find(candidate => String(candidate.ns) === ITRANSLATION_SETTINGS_NAMESPACE)
    const value = row?.value as Record<string, unknown> | undefined
    const targetLanguage = typeof value?.targetLanguage === 'string' && value.targetLanguage !== ''
      ? value.targetLanguage
      : '简体中文'
    const inputFile = typeof value?.inputFile === 'string' && value.inputFile !== ''
      ? value.inputFile
      : undefined
    return { targetLanguage, ...(inputFile === undefined ? {} : { inputFile }) }
  } catch {
    return { targetLanguage: '简体中文' }
  }
}
