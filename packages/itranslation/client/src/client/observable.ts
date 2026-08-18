/**
 * Minimal observable snapshot source compatible with the slot system's
 * `HostObservable` (getSnapshot/subscribe). Kept dependency-free so the
 * settings controller stays testable outside the web renderer.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** A HostObservable that the owning controller may also update. */
export interface MutableObservable<T> extends HostObservable<T> {
  /** Replace the snapshot and notify every subscriber. */
  set(next: T): void
}

/**
 * Create one mutable observable store.
 * @param initial - the first snapshot.
 * @returns the store.
 */
export function createObservable<T>(initial: T): MutableObservable<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}
