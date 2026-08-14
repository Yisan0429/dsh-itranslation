// commit-msg hook: enforce conventional commits headers (DEVELOPMENT.md 2.2).
// Usage: node scripts/verify-commit-msg.mjs <message-file>  (lefthook passes {1})
import { readFileSync } from 'node:fs'

const messageFile = process.argv[2] ?? '.git/COMMIT_EDITMSG'
const message = readFileSync(messageFile, 'utf8')
const header = message.split('\n').find(line => line !== '' && !line.startsWith('#')) ?? ''

const ALLOWED_TYPES = '(?:feat|fix|docs|chore|refactor|perf|test|build|ci|style|revert)'
const conventional = new RegExp(`^${ALLOWED_TYPES}(?:\\([^)\\n]+\\))?!?: .+`, 'u')
const merge = /^Merge (?:branch|pull request|remote-tracking branch|tag) /u

if (header === '' || (!conventional.test(header) && !merge.test(header))) {
  console.error(`[verify-commit-msg] rejected commit message header: ${JSON.stringify(header)}`)
  console.error('Expected conventional commits: <type>(<scope>)?!?: <subject>')
  process.exit(1)
}
