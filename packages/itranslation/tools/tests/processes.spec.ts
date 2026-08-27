import { describe, expect, it } from 'vitest'
import { deriveProcesses, mergeProcessNotes, stepFromLabel, type SessionEventLike } from '../src/processes'

function event(type: string, time: number, data?: SessionEventLike['data']): SessionEventLike {
  return { type, time, ...(data === undefined ? {} : { data }) }
}

function call(name: string, time: number, description: string): SessionEventLike {
  return event('tool/call', time, { name, arguments: JSON.stringify({ description }), turn: 1, step: 1 })
}

function sendMessage(time: number, message: string): SessionEventLike {
  return event('tool/call', time, { name: 'send_message', arguments: JSON.stringify({ subagent_id: 'a1', message }), turn: 1, step: 1 })
}

describe('stepFromLabel', () => {
  it('maps the label convention to pipeline steps', () => {
    expect(stepFromLabel('Pre-read: read the whole book')).toBe('pre-read')
    expect(stepFromLabel('Pre read 全书')).toBe('pre-read')
    expect(stepFromLabel('Translate chapter 3')).toBe('translate')
    expect(stepFromLabel('Audit translation, write report')).toBe('review')
    expect(stepFromLabel('Revise reported issues')).toBe('revise')
  })

  it('falls back to other for unrecognized labels', () => {
    expect(stepFromLabel('Check the repo layout')).toBe('other')
  })
})

describe('deriveProcesses', () => {
  it('returns empty for an empty log', () => {
    expect(deriveProcesses([])).toEqual([])
  })

  it('derives step/model/startedAt from subagent dispatches and the request header', () => {
    const events = [
      event('request/header', 1000, { header: { config: { provider: 'deepseek', model: 'deepseek-v4-flash' } } }),
      call('subagent', 2000, 'Pre-read: read the whole book'),
      call('subagent', 3000, 'Translate chapter 1'),
      call('subagent_fork', 4000, 'Audit translation, write report'),
    ]
    const records = deriveProcesses(events)
    expect(records).toEqual([
      { step: 'pre-read', model: 'deepseek-v4-flash', startedAt: new Date(2000).toISOString(), notes: 'Pre-read: read the whole book' },
      { step: 'translate', model: 'deepseek-v4-flash', startedAt: new Date(3000).toISOString(), notes: 'Translate chapter 1' },
      { step: 'review', model: 'deepseek-v4-flash', startedAt: new Date(4000).toISOString(), notes: 'Audit translation, write report' },
    ])
  })

  it('skips non-subagent tool calls and labels unparseable dispatches as other', () => {
    const events = [
      call('bash', 1000, 'irrelevant'),
      event('tool/call', 2000, { name: 'subagent', arguments: 'not-json' }),
      event('tool/call', 3000, { name: 'subagent', arguments: '{"prompt":"no description"}' }),
    ]
    const records = deriveProcesses(events)
    expect(records).toHaveLength(2)
    expect(records.every(record => record.step === 'other' && record.notes === undefined)).toBe(true)
  })

  it('handles tool calls with missing names or missing arguments', () => {
    const events = [
      event('tool/call', 1000, { name: 'subagent' }),
      event('tool/call', 2000, { arguments: '{"description":"no name"}' }),
    ]
    const records = deriveProcesses(events)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ step: 'other' })
    expect(records[0]).not.toHaveProperty('notes')
  })


  it('derives a revise record from a send_message with a Revise: prefix', () => {
    const events = [
      event('request/header', 1000, { header: { config: { model: 'm1' } } }),
      call('subagent', 2000, 'Audit translation, write report'),
      sendMessage(3000, 'Revise: fix the reported issues\nrewrite chapters per the report'),
    ]
    const records = deriveProcesses(events)
    expect(records).toEqual([
      { step: 'review', model: 'm1', startedAt: new Date(2000).toISOString(), notes: 'Audit translation, write report' },
      { step: 'revise', model: 'm1', startedAt: new Date(3000).toISOString(), notes: 'Revise: fix the reported issues' },
    ])
  })

  it('ignores send_message follow-ups without a step prefix', () => {
    const events = [
      call('subagent', 1000, 'Translate chapter 1'),
      sendMessage(2000, 'please also fix the typo in paragraph 2'),
    ]
    const records = deriveProcesses(events)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ step: 'translate' })
  })

  it('ignores an empty model header', () => {
    const events = [
      event('request/header', 1000, { header: { config: { model: '' } } }),
      call('subagent', 2000, 'Translate chapter 1'),
    ]
    const records = deriveProcesses(events)
    expect(records[0]).toMatchObject({ step: 'translate' })
    expect(records[0]).not.toHaveProperty('model')
  })


  it('derives step records from itranslation_dispatch calls', () => {
    const events = [
      event('request/header', 1000, { header: { config: { model: 'm1' } } }),
      event('tool/call', 2000, { name: 'itranslation_dispatch', arguments: JSON.stringify({ slug: 'sample', step: 'pre-read', inputPath: 'input/sample.md' }) }),
      event('tool/call', 3000, { name: 'itranslation_dispatch', arguments: JSON.stringify({ slug: 'sample', step: 'translate', chapter: 3 }) }),
      event('tool/call', 4000, { name: 'itranslation_dispatch', arguments: JSON.stringify({ slug: 'sample', step: 'audit' }) }),
      event('tool/call', 5000, { name: 'itranslation_dispatch', arguments: JSON.stringify({ slug: 'sample', step: 'revise', childId: 'c1' }) }),
    ]
    const records = deriveProcesses(events)
    expect(records).toEqual([
      { step: 'pre-read', model: 'm1', startedAt: new Date(2000).toISOString(), notes: 'Pre-read: sample' },
      { step: 'translate', model: 'm1', startedAt: new Date(3000).toISOString(), notes: 'Translate chapter 3: sample' },
      { step: 'review', model: 'm1', startedAt: new Date(4000).toISOString(), notes: 'Audit: sample' },
      { step: 'revise', model: 'm1', startedAt: new Date(5000).toISOString(), notes: 'Revise: sample' },
    ])
  })

  it('skips itranslation_dispatch calls with an unrecognized step', () => {
    const events = [
      event('tool/call', 1000, { name: 'itranslation_dispatch', arguments: JSON.stringify({ slug: 'sample', step: 'bogus' }) }),
      event('tool/call', 2000, { name: 'itranslation_dispatch', arguments: 'not-json' }),
    ]
    expect(deriveProcesses(events)).toEqual([])
  })

  it('derives a translate record without a slug', () => {
    const events = [
      event('tool/call', 1000, { name: 'itranslation_dispatch', arguments: JSON.stringify({ step: 'translate', chapter: 3 }) }),
    ]
    const records = deriveProcesses(events)
    expect(records[0]).toMatchObject({ step: 'translate', notes: 'Translate chapter 3' })
  })


  it('sums the parent LLM usage into one agent record', () => {
    const events = [
      event('request/header', 1000, { header: { config: { model: 'm1' } } }),
      event('assistant/message', 1100, { usage: { inputTokens: 10, outputTokens: 5 } }),
      event('assistant/message', 1200, { usage: { inputTokens: 20, outputTokens: 7, cacheReadTokens: 3 } }),
    ]
    const records = deriveProcesses(events)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      step: 'agent',
      model: 'm1',
      tokenUsage: { input: 30, output: 12, cacheReadTokens: 3 },
    })
    expect(records[0]?.startedAt).toBe(new Date(1100).toISOString())
    expect(records[0]?.finishedAt).toBe(new Date(1200).toISOString())
  })

  it('omits model when the log has no request header', () => {
    const events = [
      event('tool/call', 1000, { name: 'itranslation_dispatch', arguments: JSON.stringify({ slug: 's', step: 'pre-read' }) }),
      event('tool/call', 2000, { name: 'send_message', arguments: JSON.stringify({ subagent_id: 'a', message: 'Revise: fix it' }) }),
      event('assistant/message', 3000, { usage: { inputTokens: 1, outputTokens: 2 } }),
    ]
    const records = deriveProcesses(events)
    expect(records).toHaveLength(3)
    expect(records.every(record => !('model' in record))).toBe(true)
    expect(records[2]).toMatchObject({ step: 'agent', tokenUsage: { input: 1, output: 2 } })
  })

  it('sums cache-write and reasoning tokens when present', () => {
    const events = [
      event('assistant/message', 1000, {
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 2,
          cacheWriteTokens: 3,
          reasoningTokens: 4,
        },
      }),
    ]
    const records = deriveProcesses(events)
    expect(records[0]).toMatchObject({
      step: 'agent',
      tokenUsage: {
        input: 10,
        output: 5,
        cacheReadTokens: 2,
        cacheWriteTokens: 3,
        reasoningTokens: 4,
      },
    })
  })

  it('defaults missing input/output token counts to zero', () => {
    const events = [
      event('assistant/message', 1000, { usage: { cacheReadTokens: 1 } }),
    ]
    const records = deriveProcesses(events)
    expect(records[0]).toMatchObject({
      step: 'agent',
      tokenUsage: { input: 0, output: 0, cacheReadTokens: 1 },
    })
  })

})

describe('mergeProcessNotes', () => {
  it('merges supplied notes into derived records by step', () => {
    const derived = [
      { step: 'pre-read', model: 'm1', startedAt: new Date(1000).toISOString() },
      { step: 'translate', model: 'm1', startedAt: new Date(2000).toISOString() },
    ]
    const merged = mergeProcessNotes(derived, [{ step: 'translate', notes: '第 1–4 章并行' }])
    expect(merged).toHaveLength(2)
    expect(merged[1]).toMatchObject({ step: 'translate', notes: '第 1–4 章并行' })
    expect(merged[1]?.model).toBe('m1')
  })

  it('appends supplied steps not present in the derived set', () => {
    const merged = mergeProcessNotes([], [{ step: 'style', notes: '手工记录' }])
    expect(merged).toEqual([{ step: 'style', notes: '手工记录' }])
  })

  it('returns derived records unchanged without supplied notes', () => {
    const derived = [{ step: 'pre-read', model: 'm1' }]
    expect(mergeProcessNotes(derived, undefined)).toEqual(derived)
  })

  it('keeps derived notes when a supplied record has none', () => {
    const derived = [{ step: 'translate', model: 'm1', notes: '已有说明' }]
    const merged = mergeProcessNotes(derived, [{ step: 'translate', model: 'm2' }])
    expect(merged).toEqual([{ step: 'translate', model: 'm1', notes: '已有说明' }])
  })

  it('keeps derived notes when a supplied note is empty', () => {
    const derived = [{ step: 'translate', model: 'm1', notes: '已有说明' }]
    const merged = mergeProcessNotes(derived, [{ step: 'translate', model: 'm2', notes: '' }])
    expect(merged).toEqual([{ step: 'translate', model: 'm1', notes: '已有说明' }])
  })

})
