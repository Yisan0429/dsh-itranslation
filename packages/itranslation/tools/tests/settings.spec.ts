import { describe, expect, it } from 'vitest'
import { ItranslationSettingsSchema } from '../src/settings'

describe('itranslation settings schema', () => {
  it('applies built-in defaults', () => {
    expect(ItranslationSettingsSchema({} as never)).toEqual({ genre: 'auto', terminologyMode: 'auto' })
  })

  it('accepts a full section', () => {
    expect(ItranslationSettingsSchema({ genre: 'fiction', terminologyMode: 'manual' })).toEqual({
      genre: 'fiction', terminologyMode: 'manual',
    })
  })

  it('rejects unknown genre values', () => {
    expect(() => { ItranslationSettingsSchema({ genre: 'poetry', terminologyMode: 'auto' } as never) }).toThrow()
  })

  it('rejects unknown terminology modes', () => {
    expect(() => { ItranslationSettingsSchema({ genre: 'auto', terminologyMode: 'sometimes' } as never) }).toThrow()
  })
})
