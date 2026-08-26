// 把 itranslation client 与 core 包链入本机 DSH web 部署（/home/yisan/.dsh/profiles/web）。
//
// 背景：client 是 dual-face 包，浏览器半边靠 `dsh.client` 声明被
// `@deepseek-ai/dsh-client-modules` 扫描进 `window.__DSH_BOOT__`。扫描要求
// host Loader 里有该包的 entry，且包名能被 profile 目录（ctx.baseUrl）解析：
//   1) ~/.dsh/profiles/web/package.json 需要 client/core 两个 tarball 依赖；
//   2) ~/.dsh/profiles/web/pnpm-workspace.yaml 需要把 client 的 core 依赖
//      override 到本地 core tarball（pnpm 11 不读取 package.json 的 pnpm 字段）；
//   3) ~/.dsh/profiles/web/cordis.patch.yml 需要 insert 一行 name 为
//      `@deepseek-ai/dsh-itranslation-client` 的 entry；
// 之后重启 `dsh web`，Run 卡进度与设置页才会在浏览器出现。
//
// 幂等：重复执行不重复插入、不重复写依赖。默认 dry-run；加 `--apply` 才落盘。
// 只改用户自己的 profile（~/.dsh/profiles/web/），不改 ~/deepseek-harness。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const YAML = tryLoadYaml()

const apply = process.argv.includes('--apply')
const PROFILE = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, 'profiles/web')
  : join(process.env.HOME ?? '', '.dsh/profiles/web')

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packDir = join(PROFILE, '.itranslation-packages')
const packages = ['client', 'core'].map(kind => {
  const packagePath = join(repoRoot, `packages/itranslation/${kind}`)
  const packageJson = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'))
  const tarballPath = join(packDir, `${kind}.tgz`)
  const tarballRel = relative(PROFILE, tarballPath)
  return {
    name: packageJson.name,
    packagePath,
    tarballPath,
    fileSpec: `file:${tarballRel.split(require('node:path').sep).join('/')}`,
  }
})
const clientPackage = packages.find(({ name }) => name.endsWith('-client'))
const corePackage = packages.find(({ name }) => name.endsWith('-core'))
if (clientPackage === undefined) throw new Error('client package metadata is missing')
if (corePackage === undefined) throw new Error('core package metadata is missing')
const clientName = clientPackage.name
const coreOverride = `  '${corePackage.name}': '${corePackage.fileSpec}'`

const profilePkgPath = join(PROFILE, 'package.json')
const workspacePath = join(PROFILE, 'pnpm-workspace.yaml')
const patchPath = join(PROFILE, 'cordis.patch.yml')

function packPackages() {
  mkdirSync(packDir, { recursive: true })
  for (const { name, packagePath, tarballPath } of packages) {
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
      console.error(`[install-web-deploy] pnpm pack 失败：${name}（exit ${String(result.status)}）`)
      process.exit(result.status ?? 1)
    }
  }
}

function tryLoadYaml() {
  for (const id of ['js-yaml', 'yaml']) {
    try { return require(id) } catch { /* try next */ }
  }
  return undefined
}

function fail(msg) {
  console.error(`[install-web-deploy] ${msg}`)
  process.exitCode = 1
}

// 1) —— package.json 注入 client/core tarball 依赖 ——
if (!existsSync(profilePkgPath)) {
  fail(`profile package.json 不存在：${profilePkgPath}（请确认 DSH web profile 已初始化）`)
} else {
  const pkg = JSON.parse(readFileSync(profilePkgPath, 'utf8'))
  if (apply) packPackages()
  const deps = (pkg.dependencies ??= {})
  const changed = []
  for (const { name, fileSpec } of packages) {
    if (deps[name] !== fileSpec) {
      deps[name] = fileSpec
      changed.push(`${name}=${fileSpec}`)
    } else {
      log(`package.json ${name} 已指向 ${fileSpec}，跳过`)
    }
  }
  if (changed.length > 0) {
    log(`package.json ${apply ? '写入' : '将要写入'} ${changed.join(', ')}`)
    patchFile(profilePkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }
}

// 2) —— pnpm-workspace.yaml 写入本地 core override ——
if (!existsSync(workspacePath)) {
  fail(`profile pnpm-workspace.yaml 不存在：${workspacePath}（无法配置本地 core override）`)
} else {
  const workspaceText = readFileSync(workspacePath, 'utf8')
  const newline = workspaceText.includes('\r\n') ? '\r\n' : '\n'
  const lines = workspaceText.replaceAll('\r\n', '\n').split('\n')
  const prefixes = [`'${corePackage.name}':`, `"${corePackage.name}":`, `${corePackage.name}:`]
  const existingIndex = lines.findIndex(line => {
    const trimmed = line.trimStart()
    return line.startsWith('  ') && prefixes.some(prefix => trimmed.startsWith(prefix))
  })
  if (existingIndex >= 0) {
    if (lines[existingIndex].trim() === coreOverride.trim()) {
      log(`pnpm-workspace.yaml 已配置 ${corePackage.name} override，跳过`)
    } else {
      log(`pnpm-workspace.yaml ${apply ? '更新' : '将要更新'} ${corePackage.name} override`)
      lines[existingIndex] = coreOverride
      patchFile(workspacePath, lines.join('\n').replaceAll('\n', newline))
    }
  } else {
    const overridesIndex = lines.findIndex(line => line.trim() === 'overrides:')
    if (overridesIndex >= 0) {
      log(`pnpm-workspace.yaml ${apply ? '写入' : '将要写入'} ${corePackage.name} override`)
      lines.splice(overridesIndex + 1, 0, coreOverride)
      patchFile(workspacePath, lines.join('\n').replaceAll('\n', newline))
    } else {
      log(`pnpm-workspace.yaml ${apply ? '追加' : '将要追加'} overrides（${corePackage.name}）`)
      const normalized = workspaceText.replaceAll('\r\n', '\n')
      const separator = normalized.endsWith('\n') ? '' : '\n'
      const next = normalized + separator + '\noverrides:\n' + coreOverride + '\n'
      patchFile(workspacePath, next.replaceAll('\n', newline))
    }
  }
}

// 3) —— cordis.patch.yml 幂等插入 client entry ——
if (!existsSync(patchPath)) {
  fail(`profile patch 不存在：${patchPath}（请确认 DSH web profile 已初始化）`)
} else {
  // 幂等检测不依赖 YAML 库：直接按文本查 name 行，覆盖本脚本写入的单引号/双引号两种形态。
  const patchText = readFileSync(patchPath, 'utf8')
  const already = patchText.includes(`name: '${clientName}'`) || patchText.includes(`name: "${clientName}"`)
  if (already) {
    log(`cordis.patch.yml 已含 ${clientName} entry，跳过`)
  } else {
    const insertYaml = YAML
      ? YAML.dump([{ insert: [{ id: 'itranslation-client', name: clientName }] }], { lineWidth: -1 }).trimEnd()
      : `- insert:\n    - id: itranslation-client\n      name: '${clientName}'`
    log(`cordis.patch.yml ${apply ? '写入' : '将要追加'} insert(${clientName})`)
    appendPatch(insertYaml)
  }
}

// 4) —— 重启提示 ——
console.log('\n[install-web-deploy] 部署端收尾（在 3080 服务所在的 shell 执行）：')
console.log('  cd ~/.dsh/profiles/web && pnpm install            # 安装本地 tarball 依赖')
console.log('  dsh web                                           # 重启服务')
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

function appendPatch(insertYaml) {
  if (!apply) return
  const text = readFileSync(patchPath, 'utf8')
  const sep = text.endsWith('\n') ? '' : '\n'
  try {
    writeFileSync(patchPath, text + sep + insertYaml + '\n', 'utf8')
  } catch (error) {
    console.error(`[install-web-deploy] 无法写入 ${patchPath}：${error.code === 'EROFS' ? '当前在只读沙箱内（profile 目录不可写）。请在 3080 服务所在终端的普通 shell 里运行本脚本 --apply。' : error.message}`)
    process.exit(1)
  }
}
