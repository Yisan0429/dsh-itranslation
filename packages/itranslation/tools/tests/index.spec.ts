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

  it('registers the ten deterministic tools', () => {
    const captured = captureCtx()
    apply(captured.ctx, {})
    const toolNames = captured.registered.map(definition => definition.name)
    expect(toolNames).toEqual([
      'itranslation_prepare',
      'itranslation_segment',
      'itranslation_glossary',
      'itranslation_scoped_read',
      'itranslation_scoped_write',
      'itranslation_dispatch',
      'itranslation_align',
      'itranslation_assemble',
      'itranslation_status',
      'itranslation_prompts',
    ])
    expect(toolNames.every(toolName => /^[a-zA-Z0-9_-]+$/.test(toolName))).toBe(true)
  })

  it('rejects a non-positive over-long threshold', () => {
    const captured = captureCtx()
    expect(() => { apply(captured.ctx, { overlongThresholdBytes: 0 }) }).toThrow(TypeError)
    expect(() => { apply(captured.ctx, { overlongThresholdBytes: 1.5 }) }).toThrow(TypeError)
  })

  it('accepts a custom over-long threshold', () => {
    const captured = captureCtx()
    expect(() => { apply(captured.ctx, { overlongThresholdBytes: 64 }) }).not.toThrow()
    expect(captured.registered).toHaveLength(10)
  })
})
