// 把 itranslation 以 DSH bundle 方式链入本机 DSH web 部署（~/.dsh/profiles/web）。
//
// 背景：`dsh plugin add` 是 DSH 官方安装插件的方式。它会在 profile 里执行
// pnpm add，并把声明了 `dsh.bundle.patch` 的包自动加入 `dsh.profile.bundles`。
// 本项目因此新增 `packages/itranslation/bundle`（包名
// `@yisan0429/dsh-itranslation`）作为 bundle 入口；其 `cordis.patch.yml`
// 负责插入 client 的 host Loader entry。
//
// 本地 monorepo 还没发布到 npm，直接 `dsh plugin add <目录>` 会遇到
// `workspace:^` 在外部 profile 无法解析的问题；`link:` 目录又不会自动带出
// 传递依赖。所以本脚本采用与发布包等价的路径：
//   1) 用 pnpm pack 打出 core/tools/client/bundle 四个 tarball；
//   2) 在 profile 的 pnpm-workspace.yaml 里把 client/tools/core override 到
//      本地 tarball；
//   3) 用 `dsh plugin --profile web add file:<bundle.tgz>` 安装 bundle，
//      DSH 自动完成依赖写入、bundles 列表更新与 patch 加载。
//
// 幂等：重复执行不重复加依赖、不重复写 override；旧版脚本手工插入的
// `itranslation-client` 行会被清理，避免与 bundle patch 重复。
// 默认 dry-run；加 `--apply` 才落盘。只改用户自己的 profile，不改 ~/deepseek-harness。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const apply = process.argv.includes('--apply')
const PROFILE_NAME = process.env.DSH_PROFILE ?? 'web'
const PROFILE = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, `profiles/${PROFILE_NAME}`)
  : join(process.env.HOME ?? '', '.dsh', `profiles/${PROFILE_NAME}`)

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packDir = join(PROFILE, '.itranslation-packages')
const packages = ['core', 'tools', 'client', 'bundle'].map(kind => {
  const packagePath = join(repoRoot, `packages/itranslation/${kind}`)
  const packageJson = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'))
  const tarballPath = join(packDir, `${kind}.tgz`)
  const tarballRel = relative(PROFILE, tarballPath)
  return {
    kind,
    name: packageJson.name,
    packagePath,
    tarballPath,
    fileSpec: `file:${tarballRel.split(require('node:path').sep).join('/')}`,
  }
})
const bundlePackage = packages.find(({ kind }) => kind === 'bundle')
const clientPackage = packages.find(({ kind }) => kind === 'client')
const toolsPackage = packages.find(({ kind }) => kind === 'tools')
const corePackage = packages.find(({ kind }) => kind === 'core')
if (bundlePackage === undefined || clientPackage === undefined || toolsPackage === undefined || corePackage === undefined) {
  throw new Error('itranslation package metadata is missing')
}
const overrides = [corePackage, toolsPackage, clientPackage].map(({ name, fileSpec }) => ({ name, fileSpec }))

const profilePkgPath = join(PROFILE, 'package.json')
const workspacePath = join(PROFILE, 'pnpm-workspace.yaml')
const patchPath = join(PROFILE, 'cordis.patch.yml')

function packPackages() {
  mkdirSync(packDir, { recursive: true })
  for (const { kind, name, packagePath, tarballPath } of packages) {
    log(`正在打包 ${name} → ${tarballPath}`)
    const result = spawnSync('pnpm', ['pack', '--out', tarballPath, '--reporter', 'append-only'], {
      cwd: packagePath,
      stdio: 'inherit',
    })
    if (result.error !== undefined) {
      console.error(`[install-web-deploy] 无法执行 pnpm pack：${result.error.message}`)
      process.exit(1)
    }
    if (result.status !== 0) {
      console.error(`[install-web-deploy] pnpm pack 失败：${kind}（exit ${String(result.status)}）`)
      process.exit(result.status ?? 1)
    }
  }
}

function fail(msg) {
  console.error(`[install-web-deploy] ${msg}`)
  process.exitCode = 1
}

/**
 * Resolve how to invoke the `dsh` CLI.
 *
 * Priority:
 *   1. `DSH_BIN` env — an explicit command or absolute executable path.
 *   2. `dsh` on PATH — the normal installed CLI.
 *   3. The DeepSeek Harness source checkout's built bin, which is common in
 *      this repo's local development layout (`../deepseek-harness`).
 */
function resolveDshCommand() {
  if (process.env.DSH_BIN) return { command: process.env.DSH_BIN, args: [] }

  const probe = spawnSync('dsh', ['--version'], { stdio: 'ignore' })
  if (probe.error === undefined) return { command: 'dsh', args: [] }

  const candidates = [
    join(repoRoot, '..', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js'),
    join(process.env.HOME ?? '', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { command: process.execPath, args: [candidate] }
  }
  return null
}

// 1) —— pnpm-workspace.yaml 写入本地 overrides ——
if (!existsSync(workspacePath)) {
  fail(`profile pnpm-workspace.yaml 不存在：${workspacePath}（请确认 DSH web profile 已初始化）`)
} else {
  const workspaceText = readFileSync(workspacePath, 'utf8')
  const newline = workspaceText.includes('\r\n') ? '\r\n' : '\n'
  const lines = workspaceText.replaceAll('\r\n', '\n').split('\n')
  const changed = []
  for (const { name, fileSpec } of overrides) {
    const prefixes = [`'${name}':`, `"${name}":`, `${name}:`]
    const existingIndex = lines.findIndex(line => {
      const trimmed = line.trimStart()
      return line.startsWith('  ') && prefixes.some(prefix => trimmed.startsWith(prefix))
    })
    const overrideLine = `  '${name}': '${fileSpec}'`
    if (existingIndex >= 0) {
      if (lines[existingIndex].trim() === overrideLine.trim()) {
        log(`pnpm-workspace.yaml 已配置 ${name} override，跳过`)
      } else {
        log(`pnpm-workspace.yaml ${apply ? '更新' : '将要更新'} ${name} override`)
        lines[existingIndex] = overrideLine
        changed.push(name)
      }
    } else {
      log(`pnpm-workspace.yaml ${apply ? '写入' : '将要写入'} ${name} override`)
      const overridesIndex = lines.findIndex(line => line.trim() === 'overrides:')
      if (overridesIndex >= 0) {
        lines.splice(overridesIndex + 1, 0, overrideLine)
      } else {
        lines.push('overrides:', overrideLine)
      }
      changed.push(name)
    }
  }
  if (changed.length > 0) {
    patchFile(workspacePath, lines.join('\n').replaceAll('\n', newline))
  }
}

// 2) —— dsh plugin add file:<bundle.tgz> ——
if (!existsSync(profilePkgPath)) {
  fail(`profile package.json 不存在：${profilePkgPath}（请确认 DSH web profile 已初始化）`)
} else {
  if (apply) packPackages()
  const bundleRel = relative(PROFILE, bundlePackage.tarballPath).split(require('node:path').sep).join('/')
  const spec = `file:${bundleRel}`
  const dsh = resolveDshCommand()
  if (dsh === null) {
    fail('找不到 dsh 命令：请把 DSH 的 bin 加入 PATH，或设置 DSH_BIN 环境变量指向 dsh 可执行文件')
  } else {
    log(`${apply ? '执行' : '将要执行'} ${dsh.command} ${dsh.args.join(' ')} plugin --profile ${PROFILE_NAME} add ${spec}`)
  }
  if (apply && dsh !== null) {
    const result = spawnSync(dsh.command, [...dsh.args, 'plugin', '--profile', PROFILE_NAME, 'add', spec], {
      cwd: repoRoot,
      stdio: 'inherit',
    })
    if (result.error !== undefined) {
      console.error(`[install-web-deploy] 无法执行 dsh：${result.error.message}`)
      process.exit(1)
    }
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}

// 3) —— 同步 agent preset ——
const syncScript = join(repoRoot, 'scripts/sync-agent-preset.mjs')
log(`${apply ? '执行' : '将要执行'} node scripts/sync-agent-preset.mjs --apply`)
if (apply) {
  const result = spawnSync(process.execPath, [syncScript, '--apply'], { stdio: 'inherit' })
  if (result.error !== undefined) {
    console.error(`[install-web-deploy] 无法执行 sync-agent-preset：${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// 4) —— 清理旧版脚本手写的 client insert（bundle patch 已接管）——
if (!existsSync(patchPath)) {
  fail(`profile patch 不存在：${patchPath}（请确认 DSH web profile 已初始化）`)
} else {
  const patchText = readFileSync(patchPath, 'utf8')
  const legacyBlock = legacyClientInsert(patchText)
  if (legacyBlock !== undefined) {
    log(`cordis.patch.yml ${apply ? '清理' : '将要清理'} 旧版 itranslation-client insert（已由 bundle patch 接管）`)
    if (apply) patchFile(patchPath, patchText.replace(legacyBlock, '').replace(/\n{3,}/g, '\n\n'))
  } else {
    log('cordis.patch.yml 无旧版 itranslation-client insert，跳过')
  }
}

// 5) —— 重启提示 ——
console.log('\n[install-web-deploy] 部署端收尾（在 3080 服务所在的 shell 执行）：')
console.log(`  dsh ${PROFILE_NAME === 'web' ? '' : `--profile ${PROFILE_NAME} `} # 重启服务`)
console.log('  验证：curl -s http://127.0.0.1:3080/ | grep -o "dsh-itranslation-client"')
if (!apply) console.log('\n（当前为 dry-run，未改动任何文件；确认无误后加 --apply 重跑。）')

function log(msg) { console.log(`[install-web-deploy] ${msg}`) }

function patchFile(path, content) {
  if (!apply) return
  try {
    writeFileSync(path, content, 'utf8')
  } catch (error) {
    console.error(`[install-web-deploy] 无法写入 ${path}：${error.code === 'EROFS' ? '当前在只读沙箱内（profile 目录不可写）。请在 3080 服务所在终端的普通 shell 里运行本脚本 --apply。' : error.message}`)
    process.exit(1)
  }
}

function legacyClientInsert(text) {
  // 旧版脚本写入的形态（单引号/双引号均可）。
  const patterns = [
    /- insert:\n(?:[ \t]+-[ \t]+id:[^\n]*\n)*[ \t]+-[ \t]+id:[ \t]+itranslation-client[ \t]*\n[ \t]+[ \t]+name:[ \t]+'@deepseek-ai\/dsh-itranslation-client'[^\n]*\n/g,
    /- insert:\n(?:[ \t]+-[ \t]+id:[^\n]*\n)*[ \t]+-[ \t]+id:[ \t]+itranslation-client[ \t]*\n[ \t]+[ \t]+name:[ \t]+"@deepseek-ai\/dsh-itranslation-client"[^\n]*\n/g,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[0] !== undefined) return match[0]
  }
  return undefined
}
