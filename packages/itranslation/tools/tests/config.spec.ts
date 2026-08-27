import { describe, expect, it } from 'vitest'
import { readItranslationConfig } from '../src/config'

describe('readItranslationConfig', () => {
  it('reads targetLanguage and inputFile from the itranslation settings namespace', () => {
    const ctx = {
      get: (name: string) => name === 'settings' ? {
        describe: () => [{ ns: 'itranslation', value: { targetLanguage: 'English', inputFile: 'input/book.md' } }],
      } : undefined,
    } as never
    expect(readItranslationConfig(ctx)).toEqual({ targetLanguage: 'English', inputFile: 'input/book.md' })
  })

  it('falls back to 简体中文 and no inputFile when settings are absent', () => {
    expect(readItranslationConfig({ get: () => undefined })).toEqual({ targetLanguage: '简体中文' })
  })

  it('falls back when the namespace row or fields are missing or malformed', () => {
    const noRow = { get: () => ({ describe: () => [] }) }
    expect(readItranslationConfig(noRow)).toEqual({ targetLanguage: '简体中文' })
    const badValues = { get: () => ({ describe: () => [{ ns: 'itranslation', value: { targetLanguage: '', inputFile: 42 } }] }) }
    expect(readItranslationConfig(badValues)).toEqual({ targetLanguage: '简体中文' })
  })

  it('falls back when the settings service throws', () => {
    const ctx = {
      get: () => { throw new Error('unavailable') },
    } as never
    expect(readItranslationConfig(ctx)).toEqual({ targetLanguage: '简体中文' })
  })
})
