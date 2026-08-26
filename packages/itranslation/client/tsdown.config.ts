/**
 * Shared `clientBundle` tsdown preset (D66): emits the node-half lib plus the
 * browser module-loader bundle with CSS Module compilation/injection built in.
 * This package uses a locally vendored copy of the read-only harness preset
 * (`deepseek-harness/packages/client/tsdown.client.ts`) with its workspace
 * root rebased to this repository, so `pnpm build` works when this project
 * lives outside `~/deepseek-harness`.
 */
import { clientBundle } from './tsdown.preset.ts'

export default clientBundle('@deepseek-ai/dsh-itranslation-client', ['lib/types/index.js'])
