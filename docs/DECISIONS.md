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

### D10（2026-08-14）Python 桥走 DSH `ctx.subprocess` seam（待调研代理结论并入后定稿）

- DSH 有一等公民子进程服务 `ctx.subprocess`（`@deepseek-ai/dsh-subprocess` + `dsh-subprocess-local`）：`spawn(spec)` 全显式（argv/cwd/stdio/graceMs/env/abort）、argv 不经 shell、env 自动 scrub（`*KEY*/*TOKEN*` 与 `DSH_*`）+ 显式合并、piped stdio 供协议帧（ACP 用 ndjson 即此模式）、树级终止。**禁用裸 `child_process`**。
- Python 依赖方式（Itranslation 仓库如何被插件依赖）在 DSH 规范核实后定（候选：路径配置 + pin commit 约定 / git submodule / Itranslation 补打包）。调研代理结论并入后更新本条。

## 修订记录（2026-08-14，评估轮）

- 用户对旧路线图（P1–P5）不满意 → DESIGN.md §8 重写为里程碑制（M0–M5，Hamlet 主线）。
- 用户要求 Python 依赖方式按 DSH 规范调研 → D10 + RESEARCH-DSH.md 补"外部依赖规范"章。
- D5 拆分 Mode A/B（agent 定位张力：本仓库原设计 = agent 翻译；Itranslation Q1 = agent 编排，两者应收进同一设计）。
- D1 的"会话长上下文"卖点降级为"工作缓存"，文件协议升格为真相源。

## 未决问题（新对话可继续）

1. **Python 依赖方式定稿**（D10 后段）：路径配置 + pin commit / submodule / pip 打包，三选一后写入。
2. **著名台词策略**（Hamlet "To be, or not to be" 等）：沿用经典译本并注明出处 / 完全重译 / 双语并存。产品决策，默认建议"沿用经典译本并注明，其余自译"，待用户拍板。
3. **Mode A 与 Mode B 的优先级**：M1–M4 以 Mode A 为主线（插件价值所在）；Mode B 是否进入 M4 对比矩阵（需 Itranslation 先行模式与 CLI 行模式就绪）待定。
4. **skill 分发形态**：L1 用工作区 `.dsh/skills`（零接线）；L2 包内 skill 由插件自行注册 provider 还是文档指引手动复制，M3 时定。
