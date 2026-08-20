/**
 * Shared `clientBundle` tsdown preset (D66): emits the node-half lib plus the
 * browser module-loader bundle with CSS Module compilation/injection built in.
 * Read-only reference into ~/deepseek-harness (same pattern as the link:
 * devDependencies, D59); the preset is never modified here.
 */
import { clientBundle } from '../../../../deepseek-harness/packages/client/tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-itranslation-client', ['lib/types/index.js'])
