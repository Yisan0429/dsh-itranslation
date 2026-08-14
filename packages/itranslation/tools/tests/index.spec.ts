import { describe, expect, it } from 'vitest'
import { toolSurface } from '../src/index'

describe('tools package skeleton', () => {
  it('exposes the deterministic tool surface placeholder', () => {
    expect(toolSurface.package).toBe('@deepseek-ai/dsh-itranslation-tools')
    expect(toolSurface.milestone).toBe('skeleton')
  })
})
