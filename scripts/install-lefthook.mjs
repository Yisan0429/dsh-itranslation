// Install git hooks via lefthook. Runs automatically on `pnpm install`
// (postinstall); skip in CI (hooks are local-only checkpoints).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') process.exit(0)

const lefthook = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'lefthook.cmd' : 'lefthook',
)
if (!existsSync(lefthook)) process.exit(0)

const result = spawnSync(lefthook, ['install', '--force'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
