# 开发规范（DEVELOPMENT.md，v1）

> 本文件是**强制性**规范：适用于本仓库（dsh-itranslation）全部代码/文档变更，以及 M2 起在 Itranslation 仓库（`/home/yisan/Itranslation`）的插件相关改动。
> 违反红线（§4 R1–R9）的提交会被拒绝重做。规范自身变更须先在 DECISIONS.md 记一条决策，再改本文件。

## 1. 总原则

1. **文档先行（docs-first）**：任何代码变更前，先在 `docs/` 更新对应文档（设计/协议/决策）；"代码先跑、文档后补"不被接受。
2. **确定性优先**：管线原语必须幂等、可测、可复现——这是插件存在的理由（确定性交给管线）。
3. **最小改动**：每里程碑只做验收逼出来的最小改动；不为"将来可能"引入复杂度（如长驻进程、打包二进制——两者已被 D10 明确定性为"可选优化/开源路径"）。
4. **响亮失败**：python 缺失、版本不符、协议不匹配、失配 >0 必须显式报错给 agent/用户，禁止静默降级、吞错误。
5. **可审计**：一切决策、协议、验收记录落文件（git 可追踪），会话记忆不算数。
6. **上游铁律**：deepseek-harness checkout **只读，不 fork、不改**；只依赖其公开契约（`ctx.tools`/`ctx.subprocess`/`ctx.skills`/profile bundle/patch 格式）。Itranslation 的改动必须过其自身 CI 门槛，且只做 M2 界定的最小改动。

## 2. 流程规范

### 2.1 里程碑 gate

- 每里程碑开工前：验收标准已写入 DESIGN.md §10 / 路线图（不可"边做边定义"）。
- 里程碑结束：写 `docs/acceptance/<milestone>.md` 验收记录（做了什么、验收逐条对照、已知问题），提交后方可进入下一里程碑。
- 验收不达 → 回到本里程碑修复，不允许带债进入下一里程碑。

### 2.2 分支与提交

- `main` 常绿：typecheck + lint + test 全绿才可提交（§7 gates）。
- 里程碑 >1 个 commit 时用 `feat/<milestone>` 分支，完成后合并回 main。
- **Commit 规范（Conventional Commits）**：
  - 格式：`<type>(<scope>): <subject>`，subject 用祈使句；本项目文档与注释用中文，type/scope 用英文。
  - type：`docs`（文档）、`feat`（新能力）、`fix`（缺陷）、`refactor`（无行为变化重构）、`test`（测试）、`chore`（工具链/杂项）、`build`（构建/打包）。
  - scope 建议：`docs`/`plugin`/`tools`/`bridge`/`protocol`/`skill`/`itranslation`（跨仓库改动）。
  - 一个 commit 只做一件事；不混文档与代码无关改动。
- 版本：本仓库语义化版本（0.x 阶段：破坏性变更升 minor）；每次发布写 `CHANGELOG.md`（格式参考 Itranslation 的 CHANGELOG）；里程碑完成打 git tag（如 `m3`）。

## 3. 文档规范

- 文档结构（新对话按序阅读）：`README.md` → `docs/DECISIONS.md` → `docs/PROTOCOL.md` → `docs/DESIGN.md`（相关章节）→ `docs/DEVELOPMENT.md` → `docs/RESEARCH-*.md`。
- **决策日志纪律**：新决策 = 新增 `D#`（编号+日期+背景/结论/影响）；推翻旧决策必须写明推翻理由，不得悄悄改。
- **引用纪律**：引用 DSH checkout 内事实必须附 `路径:行号`（调研文档已有此惯例，全仓沿用）；引用不可验证的"记忆"要标注"待核实"。
- 格式：Markdown + 表格；全中文（专有名词/代码除外）；路径、工具名、协议名用行内代码。
- 文档与代码同步：改代码的同一天必须改文档；发现文档过期立即修订（允许 docs-only commit）。

## 4. TypeScript/插件包红线（本仓库，M3 起）

环境与工具链（对齐 DSH 官方惯例，已核实）：

| 项 | 规范 |
|---|---|
| 运行时 | Node `^22.19.0 \|\| >=24.0.0`（package.json `engines`）；**ESM only**（`"type": "module"`），禁 CommonJS |
| 包结构 | 照 `packages/bundle/base`/`packages/fs/tool-fs` 范本：`main: lib/index.js`、`types: lib/types/*.d.ts`、`exports`（`.`、`./cordis.patch.yml`、`./client`、`./package.json`）、`files`（lib/** + cordis.patch.yml）、`"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` |
| 构建 | tsdown 产 `lib/`；`typecheck`（tsc -b）强制 |
| lint | oxlint（配置放 `.oxlintrc.json`）；格式统一（`.editorconfig`） |
| 测试 | vitest（`pnpm test`）；单测 + 失败路径 + 协议一致性 |
| hooks | lefthook（pre-commit 跑 §7 gates 的本地子集） |
| 依赖 | pnpm；DSH 公共包一律 `peerDependencies`（cordis/dsh-tools/dsh-subprocess 等，靠 profile 的 fallback 解析到安装处单例，**禁止自带重复实例**）；非 npm 依赖只有 Itranslation（走 D10 方案 A） |

命名：包名 `dsh-itranslation`；cordis 行 `id: itranslate-tools`；工具名 `itranslate.<verb>` / `itranslate.<noun>_<verb>`；config 键 camelCase（`pythonPath`/`itranslationDir`）。

**红线（R1–R9，违反即拒）**：

- **R1 插件不调 LLM**（决策 D5）：Node 侧禁止任何 LLM API 调用；翻译要么在会话内（Mode A），要么经 Itranslation Python 管线（Mode B）。
- **R2 外部进程只经 `ctx.subprocess`**：禁止裸 `node:child_process`/`spawnSync`；禁止 postinstall/prepare 生命周期脚本（pnpm ≥10 拦 git 依赖 prepare，且引入不可审计副作用）。
- **R3 spawn spec 全显式**：`argv` 数组（**永不经 shell**、无字符串拼接注入）；`cwd` 显式；`stdio` 全指定（collect 带 maxBytes）；`graceMs`；`exec.signal` 必转发；用 `resolveExecutable` 定位后 fail-loud。
- **R4 模型参数不可信**：所有工具对模型传入的路径做解析与白名单校验——必须落在工作区根内（`input/`、`state/`、`output/`、`reports/`），越界/绝对路径逃逸即报错；同样校验 book slug（`[a-z0-9-]+`）。
- **R5 工具契约完整**：每个工具必须声明 `output.schema` + `render`；canonical 输出为无损 JSON；**render 只投影短摘要（路径/计数/状态），大对象只落盘**（上下文三闸纪律，DESIGN §3.1）。
- **R6 幂等 + 响亮失败**：每个工具/op 幂等（同参数重放结果一致、无副作用漂移）；错误返回 `ok:false` + 稳定错误码 + 中文可行动文案；禁止把宿主进程带崩（异常必须捕获归一化）。
- **R7 不依赖 DSH 内部模块**：只 import 公开包（peerDependencies），禁止 require 上游内部路径/未文档化符号。
- **R8 密钥纪律**：API key 等敏感值显式 `env` 传入、不落日志/文件/commit；尊重 `scrubbedParentEnv`（不逆向塞回 `DSH_*`）；本仓库不新增需要密钥的功能。
- **R9 会话零状态**：一切书状态（术语/风格/进度/译文）只落工作区文件协议（PROTOCOL.md），插件不依赖会话内存在/内存缓存作为真相源。

测试要求（vitest）：

- 每个工具：正常路径 + 参数校验路径（R4）+ 失败路径（python 缺失/版本不符/超时/非零退出）单测；
- 桥：mock `SubprocessRuntime` 验证 argv/env/stdio/graceMs 精确匹配（R3 的机器可验证形态）；
- 协议一致性：glossary/style/checkpoint/drafts 的 schema 校验测试（fixture 驱动）；
- 目标：工具与桥代码语句覆盖率 ≥80%；失败路径测试是**必做项**不是加分项。

## 5. Python 侧规范（M2，在 Itranslation 仓库执行）

- 必须过 Itranslation 现有门槛：uv 管理、ruff、pytest 全绿、`benchmark --quick`、版本检查（其 CI 即门禁）；改动不得破坏 CLI/GUI 现有行为。
- thin CLI（`src/itranslation_api.py`）约束：
  - 单文件、零新依赖；`sys.path` 机制照抄 `translate_book.py:24-27`（不重构包结构、不建 `itranslation/` 包）；
  - 每个 op 幂等；`--json` 输出严格符合 PROTOCOL.md §2（`{"ok":true,"result":...}` / `{"ok":false,"error":...,"code":...}`）；退出码 0/1；
  - `--version` 输出含 API 协议版本 + commit 前缀（插件探针依赖）；
  - 不持有全局状态（状态全在文件）。
- chunker/assembler/consistency 任何改动必须附同源单测；ACT/SCENE 与行模式**先写测试 fixture（Hamlet 样例文本）再实现**。
- 不触碰 `translator.py` 的 LLM 调用链（Mode B 议题未启动前禁止）；风格/术语协议读写由插件仓库定义契约、Python 侧只实现（PROTOCOL.md 是权威）。

## 6. 跨仓库协作与 pin

- **pin 矩阵**（必须同时记录三处，任何一方更新后 24h 内同步）：
  - 本仓库 manifest（`docs/pins.md` 或 README 表）：Itranslation commit/tag + DSH checkout commit；
  - Itranslation 仓库：其 SOLUTION.md 已指回本仓库（D4）；
  - 桥探针：插件启动/首次调用校验 `--version` 输出与 pin 一致，不一致即报错（R6）。
- **协议变更双仓同步**（PROTOCOL.md 为唯一权威契约）：破坏性变更必须升协议版本号 + 两仓同版本落地；顺序 = 先本仓库改协议文档（docs 提交）→ 再 Itranslation 实现（其 CI 全绿）→ 本仓库更新 pin → 联测。
- DSH 上游漂移：RESEARCH-DSH.md 头部注明核实时的 DSH checkout commit；每里程碑开工前跑一次"契约抽查清单"（见该文档 §9 路径清单），发现漂移先更新调研文档再动代码。

## 7. 质量闸门（gates）

- 本地提交前（`pnpm check` 顺序）：`typecheck` → `oxlint` → `vitest` → `build`；全绿才 commit；禁止跳过（lefthook 强制）。
- 里程碑验收：逐条对照 DESIGN.md §10 与路线图验收列，产出 `docs/acceptance/<milestone>.md`。
- M1 特别要求：DSH 会话实测须记录（书/场景/命令/模型行为观察/协议是否被遵守的结论），作为协议修订的输入。
- 禁止项：注释跳过 lint/测试；提交已知失败测试；"临时 hack"进 main。

## 8. 安全与沙箱

- 插件代码（受信任同进程路径）不请求也不绕过 sandbox 权限升级；模型可见工具仍受 fs-sandbox 治理（`workspace-write`）。
- 工具写文件路径一律工作区内（R4 白名单）；禁止往 `$DSH_HOME`、profile 目录、系统路径写。
- 日志/错误信息不含密钥、完整 API URL 参数、用户输入全文（长文本只截断摘要）。

## 9. 会话交接规范（AI 协作必守）

1. 新会话必读：README → DECISIONS → PROTOCOL → DESIGN（相关章）→ 本文件；未读先改代码 = 违规。
2. 改代码前先改文档（docs-first）；决策未落 DECISIONS 前不得动工。
3. 提交前跑 gates；提交信息符合 §2.2；每轮结束汇报：产出文件、验收对照、未决问题。
4. 禁止：改 deepseek-harness checkout；在 Itranslation 仓库改插件无关代码；把"口头/会话内约定"当作规范（一切约定必须落档）。
5. 遇到规范与现实的冲突：先记 DECISIONS 再改规范，不许绕行。

## 附录 A：验收记录模板（docs/acceptance/<milestone>.md）

```markdown
# <M#> 验收记录

- 日期 / 执行会话
- 产出清单（文件路径）
- 验收对照（DESIGN §10 / 路线图逐条：达成 / 未达成 + 证据）
- 质量闸门结果（typecheck/oxlint/vitest/build 输出摘要；Itranslation CI 状态）
- 已知问题与遗留（转入下一里程碑或明确不修）
- 决策变更（如有，指向 DECISIONS D#）
```
