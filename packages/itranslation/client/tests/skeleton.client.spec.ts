import { describe, expect, it } from 'vitest'
import { clientBrowserEntry } from '../src/client/index'
import { clientNodeEntry } from '../src/index'

describe('client package skeleton', () => {
  it('exposes the node entry placeholder', () => {
    expect(clientNodeEntry).toBe('itranslation-client-node')
  })

  it('exposes the browser bundle entry placeholder', () => {
    expect(clientBrowserEntry).toBe('itranslation-client-browser')
  })
})
