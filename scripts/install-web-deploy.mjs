// 把 itranslation client 包链入本机 DSH web 部署（/home/yisan/.dsh/profiles/web）。
//
// 背景：client 是 dual-face 包，浏览器半边靠 `dsh.client` 声明被
// `@deepseek-ai/dsh-client-modules` 扫描进 `window.__DSH_BOOT__`。扫描要求
// host Loader 里有该包的 entry，且包名能被 profile 目录（ctx.baseUrl）解析：
//   1) ~/.dsh/profiles/web/package.json 需要 file: 依赖解析到 client 包；
//   2) ~/.dsh/profiles/web/cordis.patch.yml 需要 insert 一行 name 为
//      `@deepseek-ai/dsh-itranslation-client` 的 entry；
// 之后重启 `dsh web`，Run 卡进度与设置页才会在浏览器出现。
//
// 幂等：重复执行不重复插入、不重复写依赖。默认 dry-run；加 `--apply` 才落盘。
// 只改用户自己的 profile（~/.dsh/profiles/web/），不改 ~/deepseek-harness。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
const clientPkgPath = join(repoRoot, 'packages/itranslation/client')
const clientPkgJson = JSON.parse(readFileSync(join(clientPkgPath, 'package.json'), 'utf8'))
const clientName = clientPkgJson.name
const clientRel = relative(PROFILE, clientPkgPath) // 相对 path，写入 file: 依赖时不绑定机器绝对路径
const fileSpec = `file:${clientRel.split(require('node:path').sep).join('/')}`

const profilePkgPath = join(PROFILE, 'package.json')
const patchPath = join(PROFILE, 'cordis.patch.yml')

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

// 1) —— package.json 依赖注入 ——
if (!existsSync(profilePkgPath)) {
  fail(`profile package.json 不存在：${profilePkgPath}（请确认 DSH web profile 已初始化）`)
} else {
  const pkg = JSON.parse(readFileSync(profilePkgPath, 'utf8'))
  const deps = (pkg.dependencies ??= {})
  if (deps[clientName] !== fileSpec) {
    deps[clientName] = fileSpec
    log(`package.json ${apply ? '写入' : '将要写入'} ${clientName}=${fileSpec}`)
    patchFile(profilePkgPath, JSON.stringify(pkg, null, 2) + '\n')
  } else {
    log(`package.json ${clientName} 已指向 ${fileSpec}，跳过`)
  }
}

// 2) —— cordis.patch.yml 幂等插入 client entry ——
if (!existsSync(patchPath)) {
  fail(`profile patch 不存在：${patchPath}（请确认 DSH web profile 已初始化）`)
} else {
  const patchDeps = YAML ? parsePatch() : undefined
  const already = patchDeps?.some(e => e?.name === clientName) ?? false
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

// 3) —— 重启提示 ——
console.log('\n[install-web-deploy] 部署端收尾（在 3080 服务所在的 shell 执行）：')
console.log('  cd ~/.dsh/profiles/web && pnpm install            # 安装 file: 依赖')
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

function parsePatch() {
  const text = readFileSync(patchPath, 'utf8')
  const data = YAML.load(text)
  return Array.isArray(data) ? data : []
}

function appendPatch(insertYaml) {
  if (!apply) return
  const text = readFileSync(patchPath, 'utf8')
  const sep = text.endsWith('\n') ? '' : '\n'
  // 追加前确保与既有条目之间有一行空行（仅当末尾尚无空行）
  try {
    writeFileSync(patchPath, text + sep + insertYaml + '\n', 'utf8')
  } catch (error) {
    console.error(`[install-web-deploy] 无法写入 ${patchPath}：${error.code === 'EROFS' ? '当前在只读沙箱内（profile 目录不可写）。请在 3080 服务所在终端的普通 shell 里运行本脚本 --apply。' : error.message}`)
    process.exit(1)
  }
}
