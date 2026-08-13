# 决策日志

> 新对话接手时先读本文件；每条决策含背景与理由，未决问题在文末。
> 2026-08-14 修订：用户反馈"设计有不足，评估后可覆盖"，路线图与部分结论已重估（见文末修订记录）。

## 已确认决策

### D1（2026-08-14）把 Itranslation 写成 DSH 插件

- **动机**：DSH 会话具备长上下文、compaction、subagents、工作区文件记忆与 Web GUI 人机协作，可补上 Itranslation 独立 CLI"逐块无状态调用 + 注入式上下文"的短板。
- **结论**：插件形态，而非替换独立 CLI。双模式互补：CLI = 批量、便宜、可复现的规模化生产；DSH 插件模式 = 交互式、全局一致的精品翻译 + 人机协作。
- **修订（同日）**：原"长上下文 → 全书状态活在会话里"的表述夸大。compaction 会压缩会话内容，**会话上下文只能当工作缓存，文件协议才是唯一真相源**。动机改为：插件模式的价值 = 人机协作体验 + agent 的全局判断 + 与 CLI 产物的确定性互操作。详见 DESIGN.md §1。

### D2（2026-08-14）设计阶段，暂不实现 —— 保持，路线图重估

- 用户原话："先只写设计方案，暂不实现"；修订轮中又明确"还没设计好，这些路线我还不满意"。
- 影响：本仓库当前只含设计文档；**新路线图以里程碑（M0–M5）取代旧 P1–P5，见 DESIGN.md §8**；实现按里程碑启动。

### D3（2026-08-14）插件代码放在用户目录下的独立新仓库（= 本仓库）

- 备选被否：Itranslation 仓库子目录；DSH checkout `packages/extensions/`（官方仓库，不适合放个人插件）。
- 影响：本仓库经 git spec 装入 DSH profile（DSH 官方唯一外部插件分发路径 = profile bundle）。

### D4（2026-08-14）文档与 Itranslation 仓库分离

- 用户原话："文档应该分开"。Itranslation `SOLUTION.md` Q4 只留指针。

### D5（2026-08-14）插件进程不直接调 LLM —— 修订为"两种翻译模式"拆分

- 原文把"JS 插件不调 LLM"混同为"翻译必须在会话内由 agent 做"，导致设计只有一种模式。修订：
  - **约束不变**：插件包（Node 侧）绝不直接调 LLM。
  - **Mode A（agent-as-translator，精品/交互）**：翻译由 agent/subagents 在 DSH 会话内完成（原设计路径）。
  - **Mode B（agent-as-operator，批量/可复现）**：agent 作为操作者/编排者，通过工具调用 Itranslation 的 Python 管线（CLI/headless）完成翻译——**LLM 调用发生在 Python 侧**，沿用 CLI 的质量链（句数重试、反思/修订、RAT、batch 定价、前缀缓存）。这正是 Itranslation 自身 SOLUTION.md Q1 的定位："agent 作为流水线的操作者/编排者"。
- 两模式共用同一套确定性工具与文件协议，差异只在"谁调 LLM"；SKILL.md 各给一条工作流。详见 DESIGN.md §1.3。

### D6（2026-08-14）L2 工具粒度：每原语一个工具（用户选定）

- prepare/chunk/brief/glossary_get/glossary_set/glossary_merge/style_get/style_set/checkpoint_load/checkpoint_save/assemble/audit/status 各自独立注册。
- 代价：模型可见工具列表约 13 个；收益：schema 清晰、调用正确率高、错误定位直接。工具描述控制在两行内以压低上下文成本。

### D7（2026-08-14）目标用户：仅个人自用（用户选定）

- 经 `dsh plugin add <git-spec>` 装入本机 profile；文档、测试、跨平台兼容按个人项目标准；开源化/发布工程推迟到 M5（可选）。

### D8（2026-08-14）命名保留 `dsh-itranslation`（用户选定）

- 仓库名不动；npm 包名 `dsh-itranslation`（如需 scope 后续加，不影响设计）。

### D9（2026-08-14）首个端到端验证书 = Hamlet（《哈姆雷特》，用户选定）

- **诗体戏剧**，与旧验收书（Gatsby，散文小说）性质完全不同，对设计有实质影响（已核实 Itranslation 现状）：
  1. `parse_structure` 只认 `CHAPTER/BOOK/PART/Section` 与 Markdown 标题，**不认 `ACT/SCENE`**（`src/chunker.py:321-336`）→ 结构解析需补。
  2. 句切分面向散文段落（`\n\n` 分段 + `[.!?]` 边界，`src/chunker.py:99-179`）；诗行是单 `\n` 分隔、行末标点不规则 → **需"行模式"**：一行 = 一个对齐单元，行对行翻译（对诗反而比句切分更自然）。
  3. `scripts/prepare_gutenberg.py` 尚不存在（scripts/ 仅 check_version.py）→ 需实现，且须处理戏剧版式：页眉页脚、折行、ACT/SCENE 转 `##`、人物名行（如 `HAMLET.` 独占一行）、舞台指示。
  4. 新产物概念：人物声音表（style 协议）、著名台词策略（沿用经典译本 vs 重译）、逐行双语对齐语料（Itranslation Q1 的 TM 目标，插件模式天然产出）。
- Gatsby 降级为 M5 可选回归（散文路径验证）。

### D10（2026-08-14）Python 依赖方式定案：`ctx.subprocess` 直调 + 路径配置 + 缺失即失败（调研代理核实后定稿）

- **DSH 没有一等公民方式声明插件的外部运行时依赖**（`dsh` 段仅 `bundle.patch`/`profile.bundles` 两键，`packages/boot/app-boot/src/profile.ts:41-62`）。三条既有惯例中选定最贴 seam 的**方案 A**：
  1. 插件 `inject: ['subprocess']`，用 `ctx.subprocess.resolveExecutable(pythonPath)` 定位解释器（绝对路径 X_OK 校验 / 裸名走 scrub 后 PATH；PATH/HOME/locale 保留，key/token 与 `DSH_*` 剔除）；缺失即响亮报错。
  2. `ctx.subprocess.spawn({argv:[python, <itranslationDir>/src/itranslation_api.py, <op>, '--json', ...], cwd, stdio, graceMs, signal})`：argv 不经 shell、树级终止、exec.signal 接入工具取消。**禁用裸 `child_process`**。
  3. 路径配置走 cordis.patch.yml 行 `config: { pythonPath, itranslationDir }`（个人自用改 YAML 即可；开源时可升级 settings namespace）。
  4. 版本 pin：README 约定 pin Itranslation commit/tag + `--version` 启动探针。
- 被否方案及理由：打包单文件二进制（ripgrep 路线，个人项目过度工程，留作开源时升级路径）；postinstall 拉取（pnpm ≥10 拦 git 依赖 prepare，`apps/cli/src/plugin.ts:149-155`）；README-only host 依赖（官方评为下策，`2026-08-01-packaged-ripgrep-search.md`）。
- 证据全文见 RESEARCH-DSH.md §6。

### D11（2026-08-14）著名台词策略：完全重译（用户拍板）

- Hamlet 著名台词（如 "To be, or not to be"）**全书自译**，保持单一译者风格；经典译本（朱生豪/梁实秋等）只在审校时参考，不直接采用、不做附录对照。
- 落入 style.json `policies.famous_lines: "retranslate"`。

### D12（2026-08-14）M4 只做 Mode A，Mode B 对比后延（用户拍板）

- M1–M4 专注 Mode A（agent 会话内翻译，插件价值所在）；Mode A/B 对比矩阵后延至 Itranslation 行模式与 CLI 适配就绪之后。
- M4 验收去掉"与 CLI 对比"项，改为"Mode A 全书 E2E + 审计闭环"；对比实验进 M5 可选。

### D13（2026-08-14）采纳严格开发规范并落成文档（用户要求）

- 新增两份强制性文档：`docs/DEVELOPMENT.md`（开发规范总纲：docs-first、里程碑 gate、Conventional Commits、工具链对齐 DSH 官方——tsdown/oxlint/vitest/lefthook/pnpm、插件红线 R1–R9、Python 侧规范、跨仓库 pin、质量闸门、会话交接规范）与 `docs/PROTOCOL.md`（唯一权威协议契约：thin CLI 调用契约与错误码表、glossary/style/checkpoint/drafts 文件 schema、对齐契约、版本兼容策略）。
- 工具链对齐已核实的 DSH 官方惯例（`packages/fs/tool-fs/package.json` 结构与根 scripts：tsdown 构建、oxlint、vitest、lefthook）。
- 影响：M1 起所有会话与提交必须遵守；违反红线 R1–R9 的提交拒绝重做。

## 修订记录（2026-08-14，评估轮）

- 用户对旧路线图（P1–P5）不满意 → DESIGN.md §8 重写为里程碑制（M0–M5，Hamlet 主线）。
- 用户要求 Python 依赖方式按 DSH 规范调研 → D10 定案（方案 A：`ctx.subprocess` + 路径配置 + 失败即报错）+ RESEARCH-DSH.md §6 存证。
- D5 拆分 Mode A/B（agent 定位张力：本仓库原设计 = agent 翻译；Itranslation Q1 = agent 编排，两者应收进同一设计）。
- D1 的"会话长上下文"卖点降级为"工作缓存"，文件协议升格为真相源。
- D11/D12 拍板（著名台词完全重译；M4 只做 Mode A）。

## 未决问题（新对话可继续）

1. **skill 分发形态**：L1 用工作区 `.dsh/skills`（零接线）；L2 包内 skill 由插件自行注册 provider 还是文档指引手动复制，M3 时定。
