import { describe, expect, it } from 'vitest'
import { MemFs } from './helpers'
import { parseState, readState } from '../src/state'

function io() {
  const mem = new MemFs()
  return { mem, io: { fs: mem.fs, cwd: '/workspace', signal: new AbortController().signal } }
}

describe('parseState', () => {
  it('accepts a valid BookState', () => {
    expect(parseState({ title: '三体', chapters: [{ index: 1, title: '一' }, { index: 2, title: '二' }] })).toEqual({
      title: '三体',
      chapters: [{ index: 1, title: '一' }, { index: 2, title: '二' }],
    })
  })

  it('rejects non-object roots', () => {
    expect(() => parseState(null)).toThrow(/应为/)
    expect(() => parseState([1])).toThrow(/应为/)
    expect(() => parseState('x')).toThrow(/应为/)
  })

  it('rejects a missing or non-string title', () => {
    expect(() => parseState({ chapters: [] })).toThrow(/title/)
    expect(() => parseState({ title: 1, chapters: [] })).toThrow(/title/)
  })

  it('rejects a missing or non-array chapters', () => {
    expect(() => parseState({ title: 't' })).toThrow(/chapters/)
    expect(() => parseState({ title: 't', chapters: {} })).toThrow(/chapters/)
  })

  it('rejects a malformed chapter entry', () => {
    expect(() => parseState({ title: 't', chapters: ['x'] })).toThrow(/第 1 章/)
    expect(() => parseState({ title: 't', chapters: [{ title: '一' }] })).toThrow(/index/)
    expect(() => parseState({ title: 't', chapters: [{ index: 1.5, title: '一' }] })).toThrow(/index/)
    expect(() => parseState({ title: 't', chapters: [{ index: 1 }] })).toThrow(/title/)
  })
})

describe('readState', () => {
  it('reads and validates state.json', async () => {
    const { mem, io: fsio } = io()
    mem.seed('books/s/state.json', '{"title":"三体","chapters":[{"index":1,"title":"一"}]}')
    expect(await readState(fsio, 's')).toEqual({ title: '三体', chapters: [{ index: 1, title: '一' }] })
  })
})
