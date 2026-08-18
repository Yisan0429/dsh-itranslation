import { describe, expect, it } from 'vitest'
import { apply, Config, inject, name } from '../src/index'
import { captureCtx } from './helpers'

describe('tools package entry', () => {
  it('declares the plugin contract', () => {
    expect(name).toBe('itranslation-tools')
    expect(inject).toEqual(['tools', 'fs'])
  })

  it('exposes a schemastery config schema', () => {
    expect(typeof Config).toBe('function')
  })

  it('registers the six deterministic tools', () => {
    const captured = captureCtx()
    apply(captured.ctx, {})
    expect(captured.registered.map(definition => definition.name)).toEqual([
      'itranslation.prepare',
      'itranslation.segment',
      'itranslation.glossary',
      'itranslation.align',
      'itranslation.assemble',
      'itranslation_status',
    ])
  })

  it('rejects a non-positive over-long threshold', () => {
    const captured = captureCtx()
    expect(() => { apply(captured.ctx, { overlongThresholdBytes: 0 }) }).toThrow(TypeError)
    expect(() => { apply(captured.ctx, { overlongThresholdBytes: 1.5 }) }).toThrow(TypeError)
  })

  it('accepts a custom over-long threshold', () => {
    const captured = captureCtx()
    expect(() => { apply(captured.ctx, { overlongThresholdBytes: 64 }) }).not.toThrow()
    expect(captured.registered).toHaveLength(6)
  })
})
