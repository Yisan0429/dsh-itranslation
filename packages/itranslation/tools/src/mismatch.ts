/**
 * Convert a thrown error from core `assembleBook` into the structured
 * `MismatchReport` the tools layer returns to the agent (D56: a mismatch is a
 * data condition the agent relays to the user, not a hard tool failure).
 */

import { TranslationMismatchError } from '@yisan0429/dsh-itranslation-core'
import type { MismatchReport } from './types'

/**
 * Extract `{ report, message }` from a `TranslationMismatchError`; any other
 * thrown value is re-thrown (a real failure must not be masked as a mismatch).
 */
export function mismatchFromError(error: unknown): { readonly report: MismatchReport; readonly message: string } {
  if (error instanceof TranslationMismatchError) {
    return {
      report: {
        kind: error.kind,
        chapterIndex: error.chapterIndex,
        expected: error.expected,
        actual: error.actual,
      },
      message: error.message,
    }
  }
  throw error
}
