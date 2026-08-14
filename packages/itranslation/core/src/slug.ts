/** Maximum length of a generated slug (D42: truncated at ≤ 200 characters). */
const MAX_SLUG_LENGTH = 200

/** Windows device names reserved as file basenames (case-insensitive). */
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u

/** Path separators, wildcards and Windows-invalid name characters: always dropped. */
const NAME_FORBIDDEN = /[\\/:*?"<>|]/u

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const WHITESPACE = /\s/u

function isForbiddenCharacter(character: string): boolean {
  // charCodeAt covers every character this check cares about (control codes,
  // separators, wildcards): all of them sit in the BMP.
  const code = character.charCodeAt(0)
  return code < 0x20 || code === 0x7f || NAME_FORBIDDEN.test(character)
}

/**
 * Windows treats the part before the first dot as the basename; slugs never
 * contain dots, but a reserved stem followed by a separator must still be
 * avoided (e.g. `con-txt` resolves to stem `con`).
 */
function basenameStem(slug: string): string {
  const separator = slug.indexOf('-')
  return separator < 0 ? slug : slug.slice(0, separator)
}

function isReservedBasename(slug: string): boolean {
  return WINDOWS_RESERVED_NAME.test(slug) || WINDOWS_RESERVED_NAME.test(basenameStem(slug))
}

/**
 * Deterministic book-directory slug (D42): NFKC normalize → keep Unicode
 * letters/digits (Chinese is preserved), fold every other character to a
 * single `-` → drop path separators, wildcards and control characters →
 * avoid Windows reserved basenames → lowercase → truncate at 200 characters.
 * The slug is never bound back to the title; the raw title is recorded in
 * `meta.json` (DESIGN.md §5.5).
 */
export function slugify(title: string): string {
  const normalized = title.normalize('NFKC')
  let result = ''
  let pendingSeparator = false
  for (const character of normalized) {
    if (isForbiddenCharacter(character)) continue
    if (WHITESPACE.test(character) || !LETTER_OR_DIGIT.test(character)) {
      pendingSeparator = true
      continue
    }
    if (pendingSeparator && result !== '') result += '-'
    result += character.toLowerCase()
    pendingSeparator = false
  }
  if (isReservedBasename(result)) result += '-'
  if (result.length > MAX_SLUG_LENGTH) {
    result = result.slice(0, MAX_SLUG_LENGTH).replace(/-+$/u, '')
  }
  return result
}
