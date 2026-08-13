# 决策日志

> 新对话接手时先读本文件；每条决策含背景与理由，未决问题在文末。

## 已确认决策

### D1（2026-08-14）把 Itranslation 写成 DSH 插件

- **动机**：DSH 能处理超长文本（长上下文 + compaction + subagents + 工作区文件记忆），可补上 Itranslation 独立 CLI"逐块无状态调用 + 注入式上下文"的短板——全书状态（人物、术语决策、风格基调、已译章节）在会话中持续存在。
- **结论**：插件形态，而非替换独立 CLI。双模式互补：CLI = 批量、便宜、可复现的规模化生产；DSH 插件模式 = 交互式、全局一致的精品翻译 + 人机协作。

### D2（2026-08-14）本轮仅设计，暂不实现

- 用户原话："先只写设计方案，暂不实现"。
- 影响：本仓库当前只含文档；路线图 P1–P5 按需启动。

### D3（2026-08-14）插件代码放在用户目录下的独立新仓库（= 本仓库）

- 用户原话："在用户目录重新建一个仓库"。
- 备选被否：放 Itranslation 仓库 `dsh-plugin/` 子目录（用户未选）；放 DSH checkout `packages/extensions/`（DeepSeek 官方仓库，不适合存放个人插件）。
- 影响：本仓库经 git spec 装入 DSH profile（DSH 官方唯一外部插件分发路径 = profile bundle，与独立 npm/git 包的形态天然契合）。

### D4（2026-08-14）文档与 Itranslation 仓库分离

- 用户原话："文档应该分开"。
- 影响：插件设计从 Itranslation `SOLUTION.md` 的 Q4 移出，全部落到本仓库；Itranslation 仓库只留一行指针。

### D5（2026-08-14）插件不自己调 LLM

- **设计核心决策**：翻译由 agent 在 DSH 会话内执行（吃满长上下文），插件只提供确定性骨架（分块/对齐/术语文件/checkpoint/组装/审计）。
- 理由：插件若自己调 LLM，就退化回"逐块注入式"架构，丢掉了做这个插件的唯一理由（全局一致性）。
- 衍生决策：Itranslation 的 Python 核心保持 Python（DSH 是 TS 生态，但通过子进程桥对接，不重写）；翻译功能在插件模式中由 agent 承担，`src/translator.py` 的 LLM 调用链仅在 CLI 模式使用。

## 未决问题（新对话可继续）

1. **仓库名**：暂用 `dsh-itranslation`，可改（npm 包名建议 `@<scope>/dsh-itranslation` 或 `itranslation-dsh-plugin`）。
2. **Python 依赖方式**：插件仓库如何依赖 Itranslation——git submodule？path 依赖 + 文档约定？`pip install`（Itranslation 目前无打包配置，只有 pyproject + uv）？
3. **L2 工具粒度**：`itranslate.*` 工具是"一个工具多个子命令"还是"每原语一个工具"（见 DESIGN.md 待定项）。
4. **L1 是否独立交付**：SKILL.md 可以单独先行（零依赖），是否值得在 P2 前先发一版。
5. **新会话起点**：从路线图 P1（Python headless 接口，落在 Itranslation 仓库）开始，还是先在本仓库搭 npm 骨架。
