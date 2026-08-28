import { describe, expect, it } from 'vitest'
import { DEFAULT_PROMPTS } from '@yisan0429/dsh-itranslation-core'
import { apply } from '../src/index'
import { effectivePrompts } from '../src/prompts'
import { captureCtx, fakeExec, run, toolByName } from './helpers'

describe('itranslation_prompts', () => {
  it('registers as a read-only tool returning built-in defaults without a settings service', async () => {
    const captured = captureCtx('/ws')
    apply(captured.ctx, {})
    const result = await run(toolByName(captured, 'itranslation_prompts'), {}, fakeExec('/ws'))
    expect(result).toEqual({ ok: true, source: 'defaults', prompts: { ...DEFAULT_PROMPTS } })
  })

  it('effectivePrompts prefers the settings namespace when present', () => {
    const overrides = {
      preReadPrompt: '自定义预读',
      translatePrompt: '自定义翻译',
      auditPrompt: '自定义审查',
      revisePrompt: '自定义修订',
    }
    const ctx = {
      get: (name: string) => name === 'settings' ? {
        describe: () => [{ ns: 'itranslation', value: overrides }],
      } : undefined,
    } as never
    const effective = effectivePrompts(ctx)
    expect(effective).toEqual({ source: 'settings', prompts: overrides })
  })

  it('effectivePrompts falls back to defaults when the namespace row is missing', () => {
    const ctx = {
      get: (name: string) => name === 'settings' ? { describe: () => [] } : undefined,
    } as never
    const effective = effectivePrompts(ctx)
    expect(effective.source).toBe('defaults')
    expect(effective.prompts).toEqual({ ...DEFAULT_PROMPTS })
  })

  it('effectivePrompts falls back to defaults when the settings service throws', () => {
    const ctx = {
      get: (name: string) => {
        if (name === 'settings') throw new Error('unavailable')
        return undefined
      },
    } as never
    const effective = effectivePrompts(ctx)
    expect(effective.source).toBe('defaults')
    expect(effective.prompts).toEqual({ ...DEFAULT_PROMPTS })
  })
})
