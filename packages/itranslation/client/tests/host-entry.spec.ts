/**
 * Host-side loader entry tests: the node entry placeholder, the settings
 * namespace registration (D68), and the web-route mounting (D69). These are
 * host-face tests — typechecked and run under the Host aggregate.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, clientNodeEntry } from '../src/index'
import { ITRANSLATION_SETTINGS_NAMESPACE, ItranslationSettingsSchema } from '../src/settings'
import { SETTINGS_ROUTE } from '../src/web-settings'

/** A ctx capturing settings registrations and webServer route mounts. */
function captureCtx(): { ctx: Context; registrations: Array<{ ns: unknown; schema: unknown }>; routes: Array<{ path: string }> } {
  const registrations: Array<{ ns: unknown; schema: unknown }> = []
  const routes: Array<{ path: string }> = []
  const ctx = {
    inject: (deps: string[], setup: (injected: Context) => void): void => {
      if (deps.includes('settings')) {
        setup({
          settings: {
            register: (ns: unknown, schema: unknown) => {
              registrations.push({ ns, schema })
              return {
                get: () => undefined,
                watch: () => () => {},
                update: async () => {},
                replace: async () => {},
              }
            },
          },
        } as unknown as Context)
      }
      if (deps.includes('webServer')) {
        setup({
          effect: (setupFn: () => unknown) => { setupFn() },
          webServer: {
            register: (route: { path: string }) => {
              routes.push(route)
              return () => {}
            },
          },
        } as unknown as Context)
      }
    },
  } as unknown as Context
  return { ctx, registrations, routes }
}

describe('client package host entry', () => {
  it('exposes the node entry placeholder', () => {
    expect(clientNodeEntry).toBe('itranslation-client-node')
  })

  it('registers the settings namespace and mounts the web route', () => {
    const { ctx, registrations, routes } = captureCtx()
    apply(ctx)
    expect(registrations).toEqual([{
      ns: ITRANSLATION_SETTINGS_NAMESPACE,
      schema: ItranslationSettingsSchema,
    }])
    expect(routes.map(route => route.path)).toEqual([SETTINGS_ROUTE])
  })

  it('stays inert when no settings or webServer provider is mounted', () => {
    const ctx = { inject: () => {} } as unknown as Context
    expect(() => { apply(ctx) }).not.toThrow()
  })

  it('accepts a settings provider without a webServer', () => {
    const bare = {
      inject: (deps: string[], setup: (injected: Context) => void): void => {
        if (deps.includes('settings')) {
          setup({
            settings: {
              register: () => ({
                get: () => undefined,
                watch: () => () => {},
                update: async () => {},
                replace: async () => {},
              }),
            },
          } as unknown as Context)
        }
      },
    } as unknown as Context
    expect(() => { apply(bare) }).not.toThrow()
  })
})
