// 把 itranslation agent preset 同步到本机 DSH 的用户 preset 目录
// （$DSH_HOME/.agent-presets/itranslation/），保证 repo 为唯一真相源、
// 部署副本不漂移——「改 preset → 跑本脚本 → 重启 dsh web」是唯一部署路径，
// 不需要再排查运行时到底加载哪一份文件。
//
// 幂等：内容一致时跳过写入。默认 dry-run；加 `--apply` 才落盘。
// 只改用户自己的 DSH home，不改 ~/deepseek-harness。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const apply = process.argv.includes('--apply')
const DSH_HOME = process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh')

const repoPresetDir = join(import.meta.dirname, '..', 'presets', 'itranslation')
const targetDir = join(DSH_HOME, '.agent-presets', 'itranslation')
const files = ['agent.cordis.yml', 'preset.yml']

function log(message) {
  console.log(`[sync-agent-preset] ${message}`)
}

let dirty = false
for (const file of files) {
  const sourcePath = join(repoPresetDir, file)
  const targetPath = join(targetDir, file)
  if (!existsSync(sourcePath)) {
    log(`repo 缺少 ${file}（${sourcePath}），跳过`)
    continue
  }
  const source = readFileSync(sourcePath, 'utf8')
  const target = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : undefined
  if (target === source) {
    log(`${file} 已一致，跳过`)
    continue
  }
  dirty = true
  if (apply) {
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(targetPath, source)
    log(`${file} 已同步 → ${targetPath}`)
  } else {
    log(`${file} 将要同步 → ${targetPath}（加 --apply 落盘）`)
  }
}

if (!apply && !dirty) log('全部一致，无需同步')
if (apply && dirty) log('同步完成；请重启 `dsh web` 使新会话生效')
if (apply && !dirty) log('无需同步；请重启 `dsh web` 使新会话生效')
