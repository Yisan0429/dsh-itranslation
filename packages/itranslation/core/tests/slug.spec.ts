import { describe, expect, it } from 'vitest'
import { slugify } from '../src/index'

describe('slugify', () => {
  it('keeps unicode letters and digits, folds whitespace to a single dash', () => {
    expect(slugify('三体 问题')).toBe('三体-问题')
  })

  it('lowercases latin letters and keeps digits', () => {
    expect(slugify('Book Title 3')).toBe('book-title-3')
  })

  it('normalizes NFKC before folding', () => {
    expect(slugify('ＡＢＣ')).toBe('abc')
    expect(slugify('e\u0301tude')).toBe('étude')
  })

  it('folds punctuation and repeated whitespace into one separator', () => {
    expect(slugify('hello,   world!')).toBe('hello-world')
    expect(slugify('a  -  b')).toBe('a-b')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('  book!  ')).toBe('book')
  })

  it('drops path separators, wildcards and windows-invalid characters', () => {
    expect(slugify('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
  })

  it('drops control characters', () => {
    expect(slugify('a\u0000b\u001fc')).toBe('abc')
    expect(slugify('\u007f')).toBe('')
  })

  it('returns an empty slug for titles without letters or digits', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('')).toBe('')
  })

  it('avoids windows reserved basenames, including reserved stems', () => {
    expect(slugify('CON')).toBe('con-')
    expect(slugify('com3')).toBe('com3-')
    expect(slugify('con-x')).toBe('con-x-')
    expect(slugify('console')).toBe('console')
  })

  it('truncates to 200 characters and drops a separator at the cut', () => {
    expect(slugify('a'.repeat(250))).toBe('a'.repeat(200))
    expect(slugify('a'.repeat(199) + '-' + 'b'.repeat(50))).toBe('a'.repeat(199))
  })
})
