/**
 * Shared deterministic-assembly helpers for `align` and `assemble` (D56/D58):
 * both tools read the same source/translation inputs and both convert a
 * `TranslationMismatchError` from core into a structured `ok: false` result.
 */

import { assembleBook, type BookState } from '@deepseek-ai/dsh-itranslation-core'
import { chapterTranslation } from './chapters'
import { readText, type ToolFsContext } from './io'
import { mismatchFromError } from './mismatch'
import { sourceRel } from './paths'
import type { MismatchReport } from './types'

/** Source backups and translated chapters for every chapter in `state.json`. */
export interface AssemblyInputs {
  readonly sources: string[]
  readonly translations: string[]
}

/** Read `source/<n>.md` and `chapters/<n>.md` (or fragments) for a prepared book. */
export async function readAssemblyInputs(io: ToolFsContext, slug: string, state: BookState): Promise<AssemblyInputs> {
  const sources: string[] = []
  const translations: string[] = []
  for (const chapter of state.chapters) {
    sources.push(await readText(io, sourceRel(slug, chapter.index)))
    translations.push(await chapterTranslation(io, slug, chapter.index))
  }
  return { sources, translations }
}

/** `assembleBook` outcome: success, or a structured mismatch for the agent to relay (D56). */
export type AssembleOutcome =
  | { readonly ok: true; readonly markdown: string }
  | { readonly ok: false; readonly mismatch: MismatchReport; readonly message: string }

/**
 * Run core assembly and convert `TranslationMismatchError` into `ok: false`.
 * Any other thrown value is re-thrown: a real failure must not be masked.
 */
export function assembleBookOrMismatch(
  state: BookState,
  sources: readonly string[],
  translations: readonly string[],
): AssembleOutcome {
  try {
    return { ok: true, markdown: assembleBook(state, sources, translations) }
  } catch (error) {
    const { report, message } = mismatchFromError(error)
    return { ok: false, mismatch: report, message }
  }
}
