# DEVELOPMENT（开发规范与决策日志）

> 仓库文档有且仅有四份，均置于主目录：`README.md`、`AGENTS.md`、`DESIGN.md`、`DEVELOPMENT.md`。

## 一、决策日志

### 2026-08-14

- D1 理念：质量与可复现优先；规模与成本经济。
- D2 场景：用户交书给 agent，agent 在约束下决策翻译，全程在对话框内完成。
- D3 交付：只出设计文档，暂不实现。
- D4 流程九步：第 0 步确认 + 第 1–8 步（确认要求 → 提取预读 → 风格+术语 → 按章节分段 → 子代理逐章翻译 → 对齐组装 → 全书审查 → 反思修订 → 出成品）。
- D5 第 0 步：agent 主动发问题卡（体裁/输出格式/术语模式）。
- D6 停点三处：确认要求、人工术语、审查结果过目。
- D7 子代理：一章一个 `spawn` 子代理（独立上下文、不占主上下文）；并发/分批交主 agent 自定，插件不设上限。
- D8 审查：全书译完统一审，由独立"审查模型"（可不同于主 agent 模型）执行。
- D9 反思：只修具体问题，不按章重跑；是否修订在审查后（停点③）问用户，不再在第 0 步问。
- D11 横切：不要成本闸；断点续跑不另建（见 D23）。
- D12 引擎：DSH 原生实现，无 Python 依赖。
- D14 术语自动模式：直接采用，有分歧才问。
- D15 拓扑：独立仓库起步、按"可无损并入 monorepo"的标准写；包链入本机部署；不碰在跑的 DSH checkout。
- D16 门槛：全量对标 harness gate + 专属闸（挂载验证、决策日志、lefthook；证据闸见 D18）。
- D17 命名：`@deepseek-ai/dsh-itranslation-*`。
- D18 证据闸降级：提交前不再必过，降为里程碑验收项。
- D19 审查标准：交子代理调研（书籍编译/出版行业参考）后经用户确认回填 §4；定稿 5 个维度——忠实度与准确性、术语与专名一致性、通顺与可读性（并入风格与语域）、格式标点数字、体例与信息完整性。
- D20 审查报告不分级：只列问题清单，修不修由用户停点③决定。
- D22 分段定案：插件按段落确定性分段；主 agent 仅调整异常段并留痕；最终清单落盘；子代理照单逐段翻译。
- D23 断点：DSH 会话本身持久记录全部过程，中断不影响记录；无需自建断点续跑；恢复=回到会话继续。
- D24 对齐：软对齐——段为工作单元，译文句序对齐原文，句数失配仅告警、不阻断、不自动重译。
- D25 LLM 过程：LLM 出现于五处——预读、统一风格、翻译、审查、修订。
- D26 工具定位：插件工具只做确定性书级状态管理（提取/章节识别/分段/组装/格式输出/术语表/status）；预读、统一风格、翻译、审查、修订由 agent 直接调 DSH `llm` 服务与 `subagent` 工具完成，落盘由 agent 经文件工具写。
- D28 模型覆盖（已核实）：子代理模型覆盖通道为 `SubagentStartRequest.agentOptions.{provider,model,maxTokens}`；内置 subagent 工具 schema 无 model 参数、不能每次调用动态选。
- D29 计量（已核实）：token 用量内置（per-call 流内 `usage` chunk + 会话日志 `assistant/message.usage`）；耗时无内置、须插件自测；"过程"维度须插件自打标签；翻译过程因每章独立子代理 session 而天然 per-process 隔离。
- D30 会话读取（已核实）：`ctx.sessions`/`ctx.sessionPersistence` 可读任意会话（含跨会话、跨进程）的完整事件流与消息（`Session.events`/`deriveMessages`），scope 只过滤事件订阅、不限制直读；`status` 读会话记录能力成立。
- D31 workspace 根（已核实）：书级目录根 = 该会话 `SessionHeader.cwd`（逐会话，非全局唯一）；运行时经 `exec.agent.session.header.cwd` 或 `ctx.agents.get(id)?.session.header.cwd` 获取；沙箱 `workspace-write` 写边界即此根。

### 2026-08-15

- D33 模型策略：各过程不做模型自选，第 0 步问题卡不再问模型；预读、统一风格、翻译、审查、修订统一使用部署默认模型；翻译子代理模型由 preset 中 tool-subagent 行的 `config.agentOptions.model` 固定。
- D34 证据链：不做运行归档、不承诺跨运行 diff 对比；`meta.json` 单份、每次运行覆盖，留痕可审计；可复现 = 流程可复现。
- D35 原文备份：第 1 步清理后的原文按章落盘为书级目录 `source/<n>.md`，作审查/修订依据与存档；原格式文件另行保留存档。
- D36 跨会话恢复：只支持回到原会话继续；跨会话不自动恢复，新会话视为重新交书。
- D37 审查粒度：审查模型对照原文备份按段定位问题、不逐句；报告定位到"章/段"；修订只重译问题段（D24 软对齐保留）。
- D38 约束执行：硬拦只在确定性工具处——各确定性工具执行前校验前置产物与步骤顺序（如 `assemble` 要求 `chapters/`、`audit-report.md`、`state.json` 齐全），不齐即拒绝；LLM 步骤插件不在调用路径，由 agent 遵守约定。
- D39 证据闸存档：里程碑冒烟当场人工检查、不保留证据文件。
- D42 slug 规则：仅折叠符号，保留 Unicode 字母数字（中文不折叠）；同 slug 撞车处理实现期再定。
- D43 格式策略：插件不提供格式转换工具；成品统一 Markdown；其他输入/输出格式的转换与还原由用户自行调用其他工具完成。
- D46 cwd 缺失：会话 `cwd` 为可选字段，取不到时 `prepare` 拒绝开始并提示用户先配置工作目录。
- D47 子代理工作区（已核实）：`spawn`（in-process）子会话的 `meta.cwd` 继承主会话 `SessionHeader.cwd`（主会话无 cwd 则子会话无 cwd；out-of-process dsh-sdk 未配 cwd 时同样继承、主会话无 cwd 则 spawn 失败）。配合 D46（prepare 起主会话必有 cwd），子代理与主 agent 同根，书级目录对子代理可直接读写。
- D48 长章分片：整章文本超出子代理上下文预算的超长章，由主 agent 在第 3 步按异常段机制拆分并留痕，分片各派一个子代理，译文落盘 `chapters/<n>.<k>.md`，`align` 按清单组装为第 n 章；正常章一章一代理，写 `chapters/<n>.md`。
- D49 任务注入：子代理任务仅注入该章/片文本 + 分段清单 + 逐句对齐要求；风格说明与术语表由子代理经文件工具直读书级目录文件（单一真相源，不占注入预算）。
- D50 仓库启动：pnpm workspace（根 + `packages/itranslation/{core,tools,client}`），构建对齐 harness——`tsc -b tsconfig.host/client.json`（host/client 双聚合 + 每包 project references）+ `tsdown --env.DSH_BUILD_FACE`；版本组合对齐 harness（Node ^22.19||>=24、pnpm 11.7、TS 6、oxlint 1.76、tsdown/vitest 同 harness）。
- D51 检查栈落地：oxlint（`.oxlintrc.json` 精简自 harness，type-aware + sonarjs/@stylistic 风格）、vitest v8 逐文件 100% 覆盖率闸（语句/分支/函数/行；types-only 文件豁免；API 桶文件须承载真实契约常量，纯 re-export 在 v8 下无可测语句）、knip + publint（`hygiene`）、jscpd（`duplication`）。
- D52 提交钩子：lefthook——pre-commit 增量 lint（staged `--fix`+stage_fixed）+ 全量 typecheck + 空白检查；commit-msg 用 `scripts/verify-commit-msg.mjs` 校验 conventional commits；pre-push 跑 `test:coverage`；`postinstall` 自动安装钩子。
- D53 首里程碑范围：core 确定性引擎先行（`slugify` D42、`segmentParagraphs`/`countSentences` D22/D24，零 DSH 依赖）；tools/client 为双面构建管线骨架；DSH 包依赖链入、cordis.yml/preset 组合与真实工具/UI 在后续里程碑引入。
- D54 沙箱适配：`.npmrc` 将 pnpm 内容 store 指向仓库内 `.pnpm-store/`（gitignore），使安装在工作区写沙箱下可复现（相对 store-dir 不被 pnpm 接受，故写绝对路径，仓库迁移时需同步）。
- D55 core 输入格式定案：书籍先经主目录 `~/e2m-venv` 的 E2M 统一转成 Markdown 再进入插件流程；core 只处理 Markdown，段落按 Markdown 标准以空行分段（段内换行保留），`segmentParagraphs` 维持按空行分段；标题属性 `{#...}` 剥除。
- D56 标题层级与组装失配定案：成品 Markdown 层级固定为书名 `#`、章 `##`、节 `###`；书名来自文件名（工具层传入），Markdown 中的 `#` 行按正文处理；`detectChapters` 只认 `##` 为章边界，第一个 `##` 之前的正文单独成空标题章，`###` 及更深标题保留在章正文中，无 `##` 时整本作单章；组装时书名行始终输出（空书名输出空 `#` 行），章标题固定 `##`；章数/段数失配停止组装并抛错，由工具层询问用户；句数不严格约束，子代理视情况处理。
- D57 预读与分段职责定案：预读由一个子代理读全书并直接落盘 `style.md`/`glossary.json`；`state.json` 只记章结构（章号/标题），不存逐段清单，段信息由 Markdown 空行天然承载；翻译子代理仅注入该章 Markdown 文本，译文段间空行；组装按原文/译文空行分段比对段数；超长章或格式/分段异常停下来告诉用户，不自动分片、不静默调整。

### 2026-08-17

- D58 工具面定案：`@deepseek-ai/dsh-itranslation-tools` 以 Cordis 插件形态导出 `name`/`inject`(`tools`,`fs`)/`Config`/`apply`，经 `ctx.tools.register(defineTool(...))` 注册六个确定性工具（§5.4 候选名定稿）：`itranslation.prepare`（读 Markdown→normalize/detectChapters→落盘 `source/<n>.md`+`state.json`，书名缺省取自文件名，`state.json` 已存在即拒绝防覆盖）、`itranslation.segment`（只读报告：按章段数/句数/字节，超长章标记，不写盘）、`itranslation.glossary`（`glossary.json` 的 upsert/remove 回写）、`itranslation.align`（读 source+chapters 含 `<n>.<k>` 分片→core `assembleBook` 组装校验→写 `aligned.md` 预览）、`itranslation.assemble`（前置 `state.json`+`chapters/`+`audit-report.md`→重组装→写成品 `books/<slug>/<slug>.md`+`meta.json`）、`itranslation_status`（只读进度与证据摘要）。书级目录 `<cwd>/books/<slug>/`（cwd=`exec.agent.session.header.cwd`，D31/D46）。步骤顺序/前置校验硬拦抛错（D38）；对齐失配等数据条件返回结构化 `ok:false`+`mismatch` 结果由 agent 转问用户（D56），不抛。`state.json` 即 core `BookState`（`{title,chapters:[{index,title}]}`，不增字段）；`meta.json` 记录 `schemaVersion`/`engineVersion`/书名/slug/目录/章段数/成品路径/`assembledAt`/`processes[]`（LLM 过程记录由 agent 收集后经 `assemble` 的 `processes` 入参写入，D29/D34）；`glossary.json` 为 `{entries:[{term,translation,note?,source?}]}`。
- D59 DSH 包依赖链入定案：tools 包对 DSH 运行时契约用 `peerDependencies`（`@deepseek-ai/cordis`/`@deepseek-ai/schemastery`/`@deepseek-ai/dsh-tools`/`@deepseek-ai/dsh-fs`，tsdown 据此外部化不打包），本地构建/测试用 `devDependencies` 的 `link:` 协议指向 `~/deepseek-harness` 已构建包目录（相对路径 `../../../../deepseek-harness/...`，只读引用不改 harness，红线 1/2；symlink 目标自身的 `node_modules` 承接其传递依赖解析）；`@deepseek-ai/dsh-itranslation-core` 以 `workspace:^` 链入。挂载验证脚本所需的 harness 启动栈（cordis-plugin-loader/include、dsh-llm/session/system-prompt/tools/agent/agent-loop/agent-presets/scope）同法在仓库根 `link:` 引入，仅用于本地验证脚本，不进入交付包。
- D60 preset 组合定案：preset 目录 `~/.dsh/.agent-presets/itranslation/`，含 `agent.cordis.yml`+`preset.yml`（§2.3）。基线为 shipped `standard` 副本裁剪：保留 persona/agent-instructions/tool-bash/tool-fs(+search)/tool-jobs/tool-skill/tool-ask-user/tool-todo/plan-mode/compaction/delegation（tool-subagent spawn+fork）；新增 `itranslation-tools` 行（仅注册工具、不发布服务、无需 realm）；翻译子代理模型按 D33 用部署默认，不硬编码 `agentOptions.model`（避免环境绑定），在注释中标注可按 D28 通道固定。本地链入以 `name:` 绝对路径行挂载（`lib/index.js`，README「绝对路径转 file: URL」规则）临时验证，发布后改包名+link/file: 依赖（D15/§2.6）。超长章阈值 `overlongThresholdBytes` 默认 40000，可由 preset `config` 覆盖。

### 2026-08-19

- D61 client UI 定案：`@deepseek-ai/dsh-itranslation-client` 浏览器半边按真实 DSH slot 落地——Run 卡进度经 keyed `tool.call.toolview` 为六个 `itranslation.*` 工具各注册一行（从冻结 call/result 派生中文摘要，含运行中/失败/解析失败/失配/进度）；设置页经 `settings.section`（id `itranslation`）读写 `itranslation` 命名空间中的体裁默认与术语确认模式，命名空间缺失/只读/保存失败均降级为可读提示。client 包 peer 依赖以 `link:` 指向 `~/deepseek-harness` 已构建包目录（D59 同法），浏览器 bundle 用 tsdown 输出 `lib/client.js`（CJS + `window.__ModuleLoader__.load` 手写头尾，`react`/`@deepseek-ai/dsh-client-web-react` 走平台模块表 external）。
- D62 设置命名空间注册定案：`@deepseek-ai/dsh-itranslation-tools` 在 `apply` 中经 `ctx.inject(['settings'])` 注册 `itranslation` 命名空间，schema 为 `{genre, terminologyMode}`（默认 `auto`/`auto`），与 client 设置页读取同一命名空间；无 settings provider 时注入不生效、不阻断工具注册。

## 二、开发规范（严格模式）

### 2.1 总则

1. 本规范适用于仓库内一切代码、组合文件与文档改动；与 DSH 官方生态规则冲突时，以 DSH 官方规则为准。
2. 红线零例外：任何提交不得绕过红线；确需例外，先追加决策条目、后修改规范，再动代码。
3. 仓库文档有且仅有四份，规范只写在本文档，不新增第五份。

### 2.2 仓库与工具链（对齐 harness）

- pnpm workspace；Node `^22.19 || >=24`。
- 包布局：`packages/itranslation/{core,tools,client}`，命名 `@deepseek-ai/dsh-itranslation-*`（D17），与 harness 的 `packages/<group>/<pkg>/` 约定一致。
- 构建：tsc 出 lib/types + tsdown 打包，host/client 两面（对齐 harness 的 `tsconfig.host/client` 与 `DSH_BUILD_FACE`）。
- 检查栈：typecheck、oxlint、vitest（CI 覆盖率闸 = `packages/*/*/src` **逐文件 100%**）、hygiene（knip + publint + workspace 约束）、duplication（jscpd）。
- 提交钩子 lefthook：pre-commit 增量 lint+typecheck；commit-msg conventional commits；pre-push 测试与覆盖率。
- 密钥纪律：密钥永不入库；运行时走 DSH credentials/env；`.env` 永不提交。
- cordis.yml 中仅 `config` 与 `disabled` 允许 `!!js`（严禁 `!js`），其余字段保持字面量。

### 2.3 组合（cordis.yml）规范

- preset 目标目录：`~/.dsh/.agent-presets/itranslation/`，含 `agent.cordis.yml` + `preset.yml`（name/description）。
- 基线来源：以 shipped preset 的**副本**起步修改；严禁改动部署自带的 shipped preset 目录。
- 行规：每行 `id` + `name`（包名）+ 可选 `config`；包名必须能被本机部署解析（link 或 file: 依赖，D15）。
- 服务行必须置于带 `isolate` realm 的 group 内（`true` = 本 preset 私有实例）；只消费宿主注册表的行不得套 realm。
- 每个 group/行必须写注释说明 plane 归属与 realm 理由（对齐 shipped `standard` 组合的注释风格）。
- 挂载验证：任何 cordis.yml 改动后必须 `standingKeyFor` 通过；roster 的 `broken` 字段不算验证。
- 交付形态：agent preset；动态 Cordis 插件仅允许临时验证，不得作为交付物。

### 2.4 代码红线（DSH 插件生态规则）

- 访问服务用 `ctx.get(name)` + undefined 检查；`inject` 仅用于硬依赖；未声明不得访问 `ctx.xxx`。
- 一切副作用可逆：`ctx.effect` / `ctx.on` / 官方 disposer；停用与更新即清理。
- 注册前必须先 Inspect 查询真实 API（Service/Event/Slot/Builtin），禁止凭名字猜接口。
- Host/Client 只走 Package 私有 JSON RPC，仅传 lossless JSON；禁止序列化或整拷贝 live data（Session、Tool、Slot props 等）。
- Client UI 用 `React.createElement`（动态插件期禁 JSX/TS/import）；UI 注册进查询过的 Slot，不碰 `document.body` 与全局 DOM。
- 动态插件期代码为纯 JS 函数体；正式包为 TS，遵循 harness tsconfig 与包边界。
- 模型调用一律走 DSH `llm` 路由与子代理，禁止自建 API 客户端或硬编码第三方端点。
- 每次翻译运行必产 `meta.json` 证据链。

### 2.5 专属质量闸（提交前必过）

1. **挂载闸**：改动 cordis.yml → `standingKeyFor` 通过。
2. **决策闸**：任何设计决策变更 → 本文件「决策日志」追加 D 条目（一行一条），与代码同提交。
3. **证据闸（里程碑级）**：`tools`/`core` 包行为改动以单元测试为准；每个里程碑验收时用样本短书跑通九步冒烟并产出 `meta.json`，当场人工检查，不存档（D39）。
4. **红线复核**：review 时逐条对照 2.4 与 2.7。

### 2.6 发布与安装回环（D15）

- preset 安装到 `~/.dsh/.agent-presets/itranslation/`；包通过 pnpm link（或 file: 依赖）链入本机部署。
- 迁移预留：目录布局、命名、脚本全部按 harness 约定，将来并入 monorepo 只做物理搬家。

### 2.7 红线清单（零例外）

1. 不改 `~/deepseek-harness` 的任何文件（只读参考）；并入 monorepo 须单独决策（D15）。
2. 不改部署 shipped preset；需改动复制副本。
3. 无 Python 依赖、不建 subprocess 桥（D12）。
4. 不绕过 `DESIGN.md` §6 四类约束。
5. 每次翻译运行必产 `meta.json` 证据链。
6. 不做成本闸（D11）。
7. 不新增第五份仓库文档。

## 三、文档约定

- 四份文档、置于主目录、有且仅有。
- 新设计结论进 `DESIGN.md`；新决策进本文件「决策日志」，D 序号递增。
- 决策覆盖旧决策时：删旧写新，日志只保留现行决策。
- `README.md`（概览/命令/里程碑）与 `AGENTS.md`（agent 守则）已随架构启动落盘（D50），随规范演进同步维护。
