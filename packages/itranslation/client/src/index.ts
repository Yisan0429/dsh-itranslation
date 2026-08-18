/**
 * Host-side node entry of the itranslation client UI package (D17). As the
 * host Loader entry, it must be a valid Cordis plugin shape; the host half
 * provides no behavior, so `apply` is a no-op (same pattern as harness
 * `@deepseek-ai/dsh-client-ui-tool`). The browser bundle lives under
 * src/client; `dsh.client` in package.json drives its registration.
 */
export const clientNodeEntry = 'itranslation-client-node' as const

/** Host loader no-op apply: the host side registers nothing. */
export function apply(): void {}
