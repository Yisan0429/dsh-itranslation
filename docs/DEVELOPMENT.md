# 开发规范（DEVELOPMENT.md，v1）

> 本文件是**强制性**规范：适用于本仓库（dsh-itranslation）全部代码/文档变更，以及 M2 起在 Itranslation 仓库（`/home/yisan/Itranslation`）的插件相关改动。
> 违反红线（§4 R1–R9）的提交会被拒绝重做。规范自身变更须先在 DECISIONS.md 记一条决策，再改本文件。

## 1. 总原则

1. **文档先行（docs-first）**：任何代码变更前，先在 `docs/` 更新对应文档（设计/协议/决策）；"代码先跑、文档后补"不被接受。
2. **确定性优先**：管线原语必须幂等、可测、可复现——这是插件存在的理由（确定性交给管线）。
3. **最小改动**：每里程碑只做验收逼出来的最小改动；不为"将来可能"引入复杂度（长驻进程、打包二进制、`ctx.subprocess` 桥——均已被 D14 明确排除：零外部进程）。
4. **响亮失败**：协议不匹配、失配 >0、文件缺失必须显式报错给 agent/用户，禁止静默降级、吞错误。
5. **可审计**：一切决策、协议、验收记录落文件（git 可追踪），会话记忆不算数。
6. **上游铁律**：deepseek-harness checkout **只读，不 fork、不改**；只依赖其公开契约（`ctx.tools`/`ctx.skills`/`ctx.systemPrompt`/profile bundle/patch 格式，以官方 cookbook 为准绳）。Itranslation 仓库 M1–M4 **不动**；未来若动其代码，必须过其自身 CI 门槛并按当时决策执行。

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

## 4. TypeScript/插件包规范（本仓库，M3 起）——完全按 DSH 插件生态（决策 D15）

**规范来源（最高准绳，只读 checkout `/home/yisan/deepseek-harness`）**：
`docs/cookbook/adding-a-package.md`（包清单）、`docs/cookbook/adding-a-tool.md`（工具契约源真）、`docs/cookbook/extension-cookbook.md`（特性→机制映射）。本文件条款与上游冲突时以 cookbook 为准。

### 4.1 包结构不变式（源自 adding-a-package.md，逐条强制执行）

- 环境：Node `^22.19.0 || >=24.0.0`；**ESM only**（`"type": "module"`）。
- package.json 不变式：`main: "lib/index.js"`、`types: "lib/types/index.d.ts"`、`exports["."].types/default` 指向二者；`@deepseek-ai/cordis` 同时出现在 `peerDependencies` 与 `devDependencies`（同版本范围）；每个 dsh peer 依赖镜像进 devDependencies；`@deepseek-ai/schemastery` 放 `dependencies`（运行时校验器）；`"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`。
- **`files` 精确清单**：`lib/index.js`、`lib/invariant.js`、`lib/types/**/*.d.ts` + 包特定运行时产物（本包 = `cordis.patch.yml` + `skills/**`）；**不发布** src、declaration maps、JS maps、残留根声明文件。
- 包内相对导入用显式 `.ts` 后缀（编译器产 `.js`，声明保留 `.ts` 供 NodeNext 消费者解析）。
- 单包拓扑（D15）：single-purpose plugin = one package，不做 Service Definition/Provider 拆分。
- 源码布局照 `packages/extensions/tool-cordis` 范本：`src/index.ts`（name/inject/apply/`static Config`）+ 按需拆 `src/prompt.ts`（系统提示词段）、`src/present.ts`（卡片呈现）。

### 4.2 工具契约（源自 adding-a-tool.md，逐条强制执行）

- 注册：`ctx.tools.register(defineTool({...}))`，effect 化（插件 fiber dispose 即注销）；`parameters` 用 schemastery DSL；`args` 由 `defineTool` 自动校验并类型化——`execute` 内仍须手检 DSL 表达不了的约束（非空串、正数、跨字段规则、R4 路径白名单）。
- `output`：`schema`（canonical 值 schema，根可为 object/array/scalar/null）+ `render(args, value)`（模型面向内容）；**canonical 值是给程序的 API**（Code Mode `await tools.<name>(args)` 直接解析到它），人类解释只在 `render`。
- `execute(args, exec)`：args 只读；**基础设施失败 = throw**（registry 记 isError）；**领域非理想结果 = 成功 canonical 值**（如 `{ok:false, code, error}` 是值不是异常）——PROTOCOL 错误模型与此对齐；`exec.signal` 必须遵守；`output.presentationMeta(args, value)` 承载可重放卡片事实。
- **UI 卡片**：`presentCall`/`presentResult` 返回 card-tagged 意图（本包用 `generic` 与 `diff`——写文件的工具给 diff 卡，`locations` 标文件）；**presenter 铁律：纯函数**（禁 I/O、禁会话状态、禁时钟/随机），UI 格式化不进模型结果，`defineTool` 对旧参数软校验（回放永不崩）。
- 长任务：翻译进度不进 `ctx.jobs`（翻译在会话内/subagent 里，不是插件后台任务）；工具本身全部短同步/近同步。

### 4.3 生态组装（源自 extension-cookbook.md 特性→机制映射）

| 我们的特性 | 生态机制 |
|---|---|
| 13 个确定性工具 | `ctx.tools.register()`（schema 自动进 system-prompt 装配） |
| 翻译契约/工作流提示词段 | `ctx.systemPrompt.section()`（有序、scope-local 遮蔽） |
| 全书翻译工作流 skill | skill 文件（工作区 `.dsh/skills` 或包内 provider） |
| 章节/场景并行翻译 | 内置 `tool-subagent`（后台 fan-out；写文件+短报告） |
| 文件读写 | 内置 `tool-fs`；插件自身文件 I/O 走 `ctx.fs`（受 sandbox 后端治理），不经 `node:fs` |
| 进度/状态 | 文件协议（PROTOCOL.md），会话零状态 |

### 4.4 README 规范结构（源自 adding-a-package.md §4，本包必须）

包 README 依序：服务 API/配置/事件/设计要点 → **Model Experience**（每项：Request context and condition → What the model sees / Token effect / KV Cache effect 三个 H4）→ **Known Limitations and Deferred Work**。Model Experience 按实现填写，不写别的包的工作；系统提示词段原文放 H5 + code fence。

### 4.5 命名与角色词汇（源自 adding-a-package.md §3 角色表）

- 包名 `dsh-itranslation`（D8）；cordis 行 `id: itranslate-tools`；工具名 `itranslate.<verb>` / `itranslate.<noun>_<verb>`；config 键 camelCase。
- 内部类命名用上游角色词汇，不许乱造：状态 CRUD 类 = `Store`（GlossaryStore/StyleStore/CheckpointStore）；领域算法类 = `Engine`（ChunkEngine/AssembleEngine/AuditEngine）；纯值转换 = `Presenter`。类角色与 `ctx` 键单复数一致（本包不注册新 `ctx` 服务，全部经 `ctx.tools`）。

**红线（R1–R9，违反即拒）**：

- **R1 插件不调 LLM**（决策 D5）：Node 侧禁止任何 LLM API 调用；翻译要么在会话内（Mode A），要么由 agent 用内置 bash 工具直跑 Itranslation CLI（Mode B，D14）。
- **R2 零外部进程**（D14）：插件代码禁止 spawn 任何外部进程（无 Python、无 `node:child_process`）；禁止 postinstall/prepare 生命周期脚本。若未来 Mode B 需要类型化编排，必须重开决策并按 RESEARCH-DSH.md §5/§6 重新评估，不得私自引入。
- **R3 文件 I/O 走 `ctx.fs`**：插件自身读写一律 `ctx.fs`（受 sandbox 后端治理）；禁止 `node:fs` 绕过。
- **R4 模型参数不可信**：所有工具对模型传入的路径做解析与白名单校验——必须落在工作区根内（`input/`、`state/`、`output/`、`reports/`），越界/绝对路径逃逸即报错；同样校验 book slug（`^[a-z0-9-]+$`）与 scene/chunk id 格式。
- **R5 工具契约完整**：每个工具声明 `output.schema` + `render`（§4.2）；canonical 输出为无损 JSON；**render 只投影短摘要（路径/计数/状态），大对象只落盘**（上下文三闸纪律，DESIGN §3.1）。
- **R6 幂等 + 错误模型**：每个工具幂等（同参数重放结果一致）；基础设施失败 throw（isError）；领域非理想结果（失配、文件缺失）为成功 canonical 值 `{ok:false, code, error}`（PROTOCOL 错误码表）；禁止把宿主进程带崩（异常必须捕获归一化）。
- **R7 不依赖 DSH 内部模块**：只 import 公开包（peerDependencies：cordis/dsh-tools/schemastery/dsh-fs/dsh-system-prompt 等），禁止 require 上游内部路径/未文档化符号。
- **R8 密钥纪律**：本仓库无密钥功能；不新增需要 API key 的代码路径；日志/错误不落敏感值。
- **R9 会话零状态**：一切书状态（术语/风格/进度/译文）只落工作区文件协议（PROTOCOL.md），插件不依赖会话内存在/内存缓存作为真相源。

测试要求（vitest）：

- 每个工具：正常路径 + 参数校验路径（R4）+ 领域非理想路径（`ok:false` 各错误码）单测；
- 确定性原语（chunk/assemble/audit/format）：**移植 Itranslation 同源测试为 golden**（`tests/test_chunker.py` 等 497 行→ TS fixtures），行为一致性以 golden 为准；
- 协议一致性：glossary/style/checkpoint/drafts 的 schema 校验测试（fixture 驱动）；
- 目标：确定性原语与工具代码语句覆盖率 ≥80%；失败路径测试是**必做项**不是加分项。

## 5. Python 侧（Itranslation 仓库）——M1–M4 不涉及（D14 预留）

- **当前阶段零 Python 侧工作**：M1–M4 全部在本仓库 TS 完成；Itranslation 仓库保持不动。
- Itranslation 仓库的作用降为：① 协议互操作的另一方（文件格式同构）；② 确定性原语的**行为参照与 golden 测试来源**（移植其测试时注明来源文件与 commit）；③ Mode B（M5 可选）时 agent 用内置 bash 工具直跑其 CLI。
- 若未来进入 Mode B 或需要修改 Itranslation（行模式/ACT-SCENE 若要在其 CLI 侧实现），必须：重开决策（DECISIONS）、过其 CI 门槛（uv/ruff/pytest/benchmark --quick）、不重构其包结构、不触碰其 translator LLM 链——按当时决策执行。

## 6. 跨仓库协作（协议互操作，替代原 pin 矩阵）

- **共享边界只有协议**（D14）：PROTOCOL.md 为唯一权威契约；两侧实现语言各自选择（本仓库 TS、Itranslation Python）。
- **行为一致性靠 golden 测试**：把 Itranslation 现有测试（chunker/assembler/consistency/format_protector 共 497 行）移植为本仓库 vitest fixtures，注明来源文件路径 + Itranslation commit；两边行为漂移时以"协议语义 + golden 用例"裁决，先在 DECISIONS 记分歧再改任一侧。
- **协议变更双仓同步**（未来涉及 Itranslation 时启用）：破坏性变更升协议版本号 + 两仓同版本落地；顺序 = 先本仓库改 PROTOCOL.md → 再 Itranslation 实现（其 CI 全绿）→ 联测记录。
- 记录要求：README 背景摘要注明当前对齐的 Itranslation 版本（v1.5.1）与移植测试来源 commit；DSH 上游漂移核查照 RESEARCH-DSH.md §9 清单每里程碑执行一次。

## 7. 质量闸门（gates）

- 本地提交前（`pnpm check` 顺序）：`typecheck` → `oxlint` → `vitest` → `build`；全绿才 commit；禁止跳过（lefthook 强制）。
- 发布/装 profile 前（对齐上游 `adding-a-package.md` §5 验证序列，适配单仓）：`pnpm install` → `constraints`（包不变式检查）→ `typecheck` → `lint` → `build` → `hygiene`（knip + publint，M3 起）；插件包在装 profile 前必须通过附录 B 生态对齐清单逐项核对。
- 里程碑验收：逐条对照 DESIGN.md §10 与路线图验收列，产出 `docs/acceptance/<milestone>.md`。
- M1 特别要求：DSH 会话实测须记录（书/场景/命令/模型行为观察/协议是否被遵守的结论），作为协议修订的输入。
- 禁止项：注释跳过 lint/测试；提交已知失败测试；"临时 hack"进 main。

## 8. 安全与沙箱

- 插件代码（受信任同进程路径）不请求也不绕过 sandbox 权限升级；模型可见工具仍受 fs-sandbox 治理（`workspace-write`）。
- 工具写文件路径一律工作区内（R4 白名单）；禁止往 `$DSH_HOME`、profile 目录、系统路径写。
- 日志/错误信息不含密钥、完整 API URL 参数、用户输入全文（长文本只截断摘要）。

## 9. 会话交接规范（AI 协作必守）

1. 新会话必读：`AGENTS.md` → README → DECISIONS → PROTOCOL → DESIGN（相关章）→ 本文件；未读先改代码 = 违规。
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
- 质量闸门结果（typecheck/oxlint/vitest/build 输出摘要；M3 起加 constraints/hygiene；涉及 Itranslation 时加其 CI 状态）
- 已知问题与遗留（转入下一里程碑或明确不修）
- 决策变更（如有，指向 DECISIONS D#）
```

## 附录 B：DSH 生态对齐清单（每里程碑核对，M3 起装 profile 前必过）

> 依据：DSH checkout `/home/yisan/deepseek-harness/docs/cookbook/adding-a-package.md`、`adding-a-tool.md`、`extension-cookbook.md`（上游为准，本清单是速查）。

| # | 检查项 | 上游依据 |
|---|---|---|
| 1 | `type: module`；`main: lib/index.js`；`types: lib/types/index.d.ts`；`exports["."].types/default` 正确 | adding-a-package §1 |
| 2 | `@deepseek-ai/cordis` 同时进 peerDependencies + devDependencies（同范围）；每个 dsh peer 镜像 devDeps；schemastery 在 dependencies | 同上（package.json invariants） |
| 3 | `files` = `lib/index.js` + `lib/invariant.js` + `lib/types/**/*.d.ts` + 本包产物（cordis.patch.yml、skills/**）；无 src/map | 同上 |
| 4 | 包内相对导入带显式 `.ts` 后缀 | 同上 |
| 5 | 单包拓扑：不拆 Service/Provider；角色命名符合角色词汇表（Store/Engine/Presenter 等） | adding-a-package §3 |
| 6 | 每个工具 `ctx.tools.register(defineTool({...}))`；`parameters` DSL 化；`output.schema + render` 齐备；`execute` 遵守"基础设施失败 throw、领域结果 canonical 值、exec.signal、args 只读" | adding-a-tool.md 全文 |
| 7 | 写文件工具带 `presentCall`/`presentResult`（diff 卡 + locations）；presenter 纯函数（禁 I/O/会话/时钟）；UI 格式化不进模型结果；`presentationMeta` 承载可重放事实 | adding-a-tool.md §How your tool renders |
| 8 | 特性挂载机制与 extension-cookbook 映射表一致（工具→`ctx.tools.register`；提示词段→`ctx.systemPrompt.section`；文件 I/O→`ctx.fs`；并行→内置 subagent） | extension-cookbook §feature→mechanism |
| 9 | 包 README 依序：API/配置/设计要点 → Model Experience（What the model sees / Token effect / KV Cache effect）→ Known Limitations and Deferred Work | adding-a-package §4 |
| 10 | `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`；patch 行 `{id, name, config?}` 格式正确 | 调研 RESEARCH-DSH.md §4 |
| 11 | 验证序列通过：install → constraints → typecheck → lint → build → hygiene（knip/publint） | adding-a-package §5（适配单仓） |
| 12 | 无生命周期脚本（postinstall/prepare）；无外部进程；peer 依赖不打包重复实例 | D14 + 调研 §6 |

