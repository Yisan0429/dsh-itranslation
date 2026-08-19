import { describe, expect, it } from 'vitest'
import { ItranslationSettingsSchema } from '../src/settings'

describe('itranslation settings schema', () => {
  it('applies empty-string defaults', () => {
    expect(ItranslationSettingsSchema({} as never)).toEqual({
      preReadPrompt: '', translatePrompt: '', auditPrompt: '', revisePrompt: '',
    })
  })

  it('accepts four prompt fields', () => {
    expect(ItranslationSettingsSchema({
      preReadPrompt: 'p1', translatePrompt: 'p2', auditPrompt: 'p3', revisePrompt: 'p4',
    })).toEqual({
      preReadPrompt: 'p1', translatePrompt: 'p2', auditPrompt: 'p3', revisePrompt: 'p4',
    })
  })

  it('rejects non-string prompt fields', () => {
    expect(() => { ItranslationSettingsSchema({ preReadPrompt: 7 } as never) }).toThrow()
  })
})
