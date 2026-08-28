/**
 * Translated-chapter reading shared by `align` and `assemble`: resolve a
 * chapter's translation from either a single `chapters/<n>.md` or the sorted
 * `<n>.<k>.md` fragments of an over-long chapter (D48).
 */

import { joinChapterFragments } from '@yisan0429/dsh-itranslation-core'
import { isFile, listDirNames, readText, type ToolFsContext } from './io'
import { chapterRel, chaptersDirRel, fragmentRel } from './paths'

/** Parse `<n>.<k>.md` fragment file names into sorted fragment numbers for chapter `index`. */
export function fragmentNumbers(names: readonly string[], index: number): number[] {
  const prefix = `${index}.`
  const suffix = '.md'
  const numbers: number[] = []
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue
    const middle = name.slice(prefix.length, name.length - suffix.length)
    if (!/^\d+$/u.test(middle)) continue
    numbers.push(Number(middle))
  }
  return numbers.sort((a, b) => a - b)
}

/** Read a chapter's translation: single file, else joined fragments (D48). */
export async function chapterTranslation(io: ToolFsContext, slug: string, index: number): Promise<string> {
  const single = chapterRel(slug, index)
  if (await isFile(io, single)) return readText(io, single)

  const names = await listDirNames(io, chaptersDirRel(slug))
  const fragments = fragmentNumbers(names, index)
  if (fragments.length === 0) {
    throw new Error(
      `第 ${index} 章译文缺失：请先翻译并落盘 chapters/${index}.md（或分片 chapters/${index}.<k>.md）`,
    )
  }
  const texts: string[] = []
  for (const fragment of fragments) texts.push(await readText(io, fragmentRel(slug, index, fragment)))
  return joinChapterFragments(texts)
}
