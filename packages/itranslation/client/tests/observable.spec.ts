import { describe, expect, it, vi } from 'vitest'
import { createObservable } from '../src/client/observable'

describe('createObservable', () => {
  it('exposes the initial snapshot', () => {
    const store = createObservable({ n: 1 })
    expect(store.getSnapshot()).toEqual({ n: 1 })
  })

  it('notifies subscribers and returns a working disposer', () => {
    const store = createObservable(0)
    const first = vi.fn()
    const second = vi.fn()
    const disposeFirst = store.subscribe(first)
    store.subscribe(second)
    store.set(1)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    disposeFirst()
    store.set(2)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledTimes(2)
  })
})
