import { describe, expect, it } from 'vitest'
import { deriveProcesses, mergeProcessNotes, stepFromLabel, type SessionEventLike } from '../src/processes'

function event(type: string, time: number, data?: SessionEventLike['data']): SessionEventLike {
  return { type, time, ...(data === undefined ? {} : { data }) }
}

function call(name: string, time: number, description: string): SessionEventLike {
  return event('tool/call', time, { name, arguments: JSON.stringify({ description }), turn: 1, step: 1 })
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
})
