# 设计：Itranslation as DSH 插件（v2，评估修订版）

> 状态：设计 v2（2026-08-14）。上一版经用户反馈（"路线不满意""按 DSH 规范调研依赖"）与本轮一手核实后全面重估，覆盖 v1。
> 调研与核实依据：`docs/RESEARCH-DSH.md`（DSH 机制+外部依赖规范）、`docs/ITRANSLATION-CORE.md`（Itranslation 现状，含 Hamlet 缺口核实）、`docs/DECISIONS.md`（决策与修订记录）。

## 零基础导读（先看这里，1 分钟看懂本项目）

1. **做什么**：做一个插件，让你在自己的 AI 助手（DeepSeek Harness）里**边聊边翻译整本书**。第一本：《哈姆雷特》（诗体戏剧），最终产出完整中文电子书（txt/Markdown/epub）。
2. **用起来什么样**：对 AI 说"开始翻哈姆雷特" → AI 处理原文、按幕/场切段，一场场翻译；人名地名等译法**先问你定夺**，定下的记入术语本全书统一；你随时插话改风格（"再文雅点""语气再阴郁些"），记入风格本后续都遵守；随时暂停、下次"接着翻"靠进度本续跑；最后程序拼装成书。
3. **和原命令行工具的分工**（Itranslation，`/home/yisan/Itranslation`）：命令行版 = 批量全包（便宜、快、不用盯、可复现）；本插件 = 精品模式（人盯着翻、随时改、讲究全书风格统一）。两者产物互通（同一套文件格式），不互相替代。
4. **三个核心思想**：
   - AI 的记忆靠不住（会话一长就被压缩）→ **一切重要东西落文件**（术语本/风格本/进度本/稿子），文件是唯一真相源，AI 干活前先读文件；
   - **分工**：AI 负责翻译（要理解力），插件程序负责机械活（切文本/对行数/拼装/查术语漂移）——机械活由程序做就绝不出错、错了也查得出；
   - **写法**：全 TypeScript、完全按 DeepSeek 官方插件规矩（用户拍板"完全按 DSH 插件生态"），零外部依赖，装进 AI 助手最顺。
5. **分五步**：M1 先不写代码，用一份"工作说明书"让 AI 真翻第一幕，验证规矩行不行 → M2 把机械活写成程序（移植原 Itranslation 测试保一致）→ M3 包装成正式插件装入实测 → M4 全书翻完验收 → M5（可选）对比实验/网页面板/开源。
6. **现状**：设计阶段（M0）完成，零代码；下一步 M1。本导读之后的内容是给实现者看的技术细节，产品层面看 §1/§6/§8/§10 即可。

## 0. 上一版的问题（为什么重写）

1. **卖点夸大**：v1 称"全书状态活在会话里"。DSH 实际有三道闸把逐字内容逐出上下文：spill（工具结果 >50KB 落盘）、tool-result-pruner（>8KB 只留头尾）、compaction（旧区间 LLM 摘要化，只留 ~16% 尾巴）。**会话上下文只能是工作缓存；工作区文件才是唯一真相源。**
2. **D5 一刀切**：把"插件不调 LLM"混同为"翻译必须由 agent 在会话内做"，漏掉了 agent-as-operator 模式——而 Itranslation 自身 SOLUTION.md Q1 的定位正是"agent 作为流水线的操作者/编排者"。v2 拆分 Mode A / Mode B（§1.3）。
3. **subagent 回传机制没设计**：DSH 的 subagent 把**最后一次 assistant 消息全文**回传给父代理（非摘要）。章节 fan-out 若整章回传会撑爆父上下文；正确姿势是 subagent 写文件、只回短报告（dsh-translate-docs skill 即此解法）。v2 把它固化为"简报驱动"工作流（§6）。
4. **Python 桥不符合 DSH 规范**：v1 写"Node `child_process` 长驻调用"。DSH 有一等 seam `ctx.subprocess`（`spawn`/`resolveExecutable`/env scrub/树级终止），ACP/LSP/ripgrep 全走它；v2 一度改用该 seam，**D14 起（全 TS）连桥一起取消**——共享边界改为文件协议（调研结论留档 RESEARCH-DSH.md §5/§6 作 Mode B 预留知识）。
5. **P1 headless 接口过度设计**：长驻进程 + JSON 行协议对纯计算原语（chunker/assembler/consistency，无模型加载）是过度工程。v2 曾改为单次调用 thin CLI；**D14 起 thin CLI 也取消**（本仓库 TS 原生实现，见 §3.2）。
6. **验收书与工具假设全按散文小说（Gatsby）设计**；首书改为 **Hamlet（诗体戏剧）**后已核实的三个缺口：`parse_structure` 不认 ACT/SCENE；句切分面向散文段落、不适用诗行；`prepare_gutenberg.py` 尚不存在（§7）。
7. **路线图是工序列表（P1–P5）而非成果里程碑**；v2 改为 M0–M5 里程碑制，Hamlet 为主线（§8）。
8. **人机协作循环只挂在远期 L3 UI 上**；协作首先是协议问题（审校记录、裁定、重译语义），v2 落入文件协议与工作流（§5、§6），UI 只是它的呈现层。

## 1. 价值主张（诚实版）

### 1.1 双模式定位

| | 独立 CLI（Itranslation） | DSH 插件模式（本仓库） |
|---|---|---|
| 场景 | 批量、便宜、可复现的规模生产 | 交互式精品翻译 + 人机协作 |
| 一致性来源 | glossary/RAT 注入 + 一致性审计 | 文件协议（glossary/style）+ 同样用管线审计兜底 |
| 成本 | batch API、前缀缓存、并行 | 会话内翻译更贵（Mode B 可回 CLI 定价） |
| 可复现性 | 高（checkpoint + 确定性管线） | 低（文件协议 + 审计保证跨会话一致） |

两者共用同一 Python 核心（Itranslation 仓库），产物互操作（checkpoint/glossary/␟ 对齐格式同构）。

### 1.2 记忆模型（修正 v1 的夸大表述）

三层记忆，职责分明：

| 层 | 载体 | 职责 | 可靠性 |
|---|---|---|---|
| 会话上下文 | DSH 会话 + compaction | **工作缓存**：当前任务的判断、人机对话 | 会被压缩/截断，不可依赖 |
| 工作区文件 | 文件协议（§5） | **唯一真相源**：术语、风格、checkpoint、译文全文 | 持久、可审计、跨会话续跑 |
| 确定性管线 | Itranslation Python 核心 | **确定性**：分块/对齐/组装/审计的机械正确 | 可测、可复现 |

翻译后续场景时，agent **必须读文件**（glossary/style/已译草稿），而不是依赖"记得"。

### 1.3 两种插件用法（Mode A / Mode B）

约束（决策 D5 修订版）：**插件包（Node 侧）绝不直接调 LLM**。翻译在两种模式下分工：

- **Mode A（agent-as-translator，精品/交互）**：翻译由 agent/subagents 在 DSH 会话内完成。适合：文学精品、逐段推敲、用户随手指点（"哈姆雷特的语气再阴郁一点"）。代价：token 贵、句/行数纪律靠提示词与组装校验。
- **Mode B（agent-as-operator，批量/可复现）**：agent 作为操作者，通过工具调 Itranslation 的 Python 管线（现有 CLI 或 thin API），**LLM 调用发生在 Python 侧**，沿用 CLI 的质量链（句数重试、反思/修订、RAT、batch 定价、前缀缓存）。适合：跑量、对照 CLI 基准。这与 Itranslation Q1 的自我定位一致（agent = 编排者）。

同一套工具与文件协议支撑两模式；SKILL.md 各给一条工作流路径。**M1–M4 只做 Mode A**（决策 D12，插件价值所在）；Mode A/B 对比矩阵后延至 Itranslation 行模式与 CLI 适配就绪后（M5 可选）。

## 2. 三层形态（投入递增）

### L1 — Skill（零 DSH 改动，零代码）

`SKILL.md`（frontmatter：name/description/disable-model-invocation/user-invocable）+ 随仓库的模板文件（glossary/style 骨架）。内容 = **工作流地图 + 翻译契约**：

1. 翻译契约（从 Itranslation `translator.py` 的工艺提炼）：␟ 行/句对齐、句数对齐、Context 只读、§/¶ 保留、术语先读后译、未定术语进 pending、不即兴造词。
2. 简报驱动委派：每个翻译单元由编排者生成"简报"（契约 + 单元正文 + glossary/style 命中 + 邻近样例），subagent 只读简报、译后写文件、只回短报告。
3. 文件协议读写（§5）与审计/组装步骤。

加载：工作区 `.dsh/skills/itranslate-book/SKILL.md`（rank 100，零接线）。L1 只靠 bash/read/write/subagent 现有工具跑通，不依赖 L2。

### L2 — 工具插件包（核心价值）

npm 包（本仓库）：`"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`，经 `dsh plugin --profile <name> add <git-spec>` 装入 profile。**100% TypeScript 单包插件**（D14/D15）：注册模型工具（§4）+ 确定性原语 TS 原生实现（§3.2）+ 可选包内 skill provider。插件不调 LLM（D5）。包结构/工具契约/README 结构完全按 DSH 官方 cookbook（DEVELOPMENT.md §4 + 附录 B）。

### L3 — Web 客户端 UI 插件（远期）

书籍翻译面板：场景进度、续跑、审计视图、双语对照。需要 `dsh.client` 客户端插件包；协作语义已在文件协议里，UI 只是呈现层。

## 3. 架构

```
DSH 会话（agent，长上下文但会被压缩 → 只当缓存）
 ├─ skill: itranslate-book（工作流地图 + 翻译契约）
 ├─ tools: itranslate.*（13 个，每原语一个；canonical 输出结构化、render 只投影短摘要）
 │         └─ TS 原生确定性原语（ChunkEngine/AssembleEngine/AuditEngine + *Store，§3.2）
 │            文件 I/O 走 ctx.fs（受 sandbox 治理）；零外部进程（D14）
 ├─ subagents: 翻译单元 fan-out（简报驱动：读 brief 文件 → 翻译 → 写 drafts 文件 → 短报告）
 └─ 工作区文件（唯一真相源，§5）:
     input/<book>.md · state/<book>/{glossary.json,style.json,briefs/,drafts/,checkpoints/,reviews/}
     output/<book>/ · reports/<book>/
```

### 3.1 上下文预算三闸（设计原则）

DSH 真实机制（RESEARCH-DSH.md §7 核实）：

- **spill**：工具结果 >50KB（`maxInlineBytes: 50000`）落盘、模型只见文件引用；
- **tool-result-pruner**：>8KB（threshold 8192）的工具结果只留头 4096 + 尾 1024 字符；
- **compaction**：旧区间 LLM 摘要化，只保留 ~16% 尾部原文（retainRatio 0.16）。

设计原则：**大对象只落盘，模型只见元数据与短报告**。chunk/译文/brief 全文一律写工作区文件；工具 canonical 结果可以携带完整数据（供程序消费），但 `render` 投影只给模型短摘要（路径、计数、状态）；subagent 结果必须"写文件 + 短报告"。

### 3.2 确定性原语：TS 原生实现（D14/D15）

**共享边界是协议，不是代码**（D14 二次修订）：插件模式的确定性原语在本仓库用 TypeScript 原生实现，与 Itranslation CLI 产物的互操作靠 PROTOCOL.md 文件协议保证。已量化（DECISIONS D14）：需移植的原语 = chunker/assembler/consistency/format_protector + Gutenberg 预处理，共 1349 行 Python（插件模式子集约 1000 行；extractor 的 PDF/EPUB 逻辑不需要）；配套测试 497 行一并移植为 golden。

- 实现分块：`ChunkEngine`（结构解析 ACT/SCENE + 句/行切分 + 打包）、`AssembleEngine`（body_join/first_lock + 失配统计 + txt/md/epub 输出）、`AuditEngine`（expected/observed 计数 + 漂移报告）、`FormatProtector`（占位符）、`GlossaryStore`/`StyleStore`/`CheckpointStore`（文件协议 CRUD + schema 校验）——角色命名按 DSH 词汇表（DEVELOPMENT §4.5）。
- 行为一致性靠 **golden 测试**：移植 Itranslation 同源测试（`tests/test_chunker.py` 等）为本仓库 vitest fixtures，注明来源 commit；两边漂移时以"协议语义 + golden 用例"裁决（DEVELOPMENT §6）。
- 与 CLI 的同构点：文件协议（glossary/checkpoint/drafts）、`␟` 对齐、§/¶ 标记——PROTOCOL.md 是唯一权威。
- Mode B（M5 可选）：agent 用内置 bash 工具直跑 `uv run python translate_book.py`，无需插件侧进程（原 `ctx.subprocess` 桥已随 D14 取消，调研结论留档于 RESEARCH-DSH.md §5/§6 作预留知识）。

## 4. 工具清单（L2，每原语一个，决策 D6）

模型可见字段只有 name/description/parameters（allowlist）；每个工具必须声明 `output.schema` + `render` 投影。

| 工具 | 功能 | TS 实现模块（golden 来源 = Itranslation 同名模块/测试） | render 给模型的内容（canonical 可更全） |
|---|---|---|---|
| `itranslate.prepare` | Gutenberg/纯文本预处理（页眉页脚、折行、ACT/SCENE→`##`、人物名行/舞台指示标记），写 `input/<book>.md` | `PrepareEngine`（新增；戏剧版式为 Hamlet 专项） | 输出路径 + 结构列表 + 字符数 |
| `itranslate.chunk` | 按结构切分（散文句级 / 诗行行级），写 chunks 文件 | `ChunkEngine`（golden：chunker.py + test_chunker.py；补 ACT/SCENE + 行模式） | chunks 文件路径 + 单元数/行数 + 超长行标记 |
| `itranslate.brief` | 为翻译单元渲染简报（契约 + 正文 + glossary/style 命中 + 邻近样例 + 句/行数要求），写 brief 文件 | `BriefRenderer`（工艺参照 translator.py `_build_translation_prompt`；无向量库） | brief 文件路径 + 命中术语数 |
| `itranslate.glossary_get` | 读术语表（按书 slug） | `GlossaryStore`（golden：consistency.py + test_consistency.py） | 术语数 + 关键条目摘要 |
| `itranslate.glossary_set` | 新增/更新单条术语（含 pending/alias 候选） | 同上 | 确认行 |
| `itranslate.glossary_merge` | 批量合并术语（人工/agent 裁定后） | 同上（merge 语义） | 增/改/删计数 |
| `itranslate.style_get` | 读风格书（人物声音/策略） | `StyleStore` | 条目数摘要 |
| `itranslate.style_set` | 更新风格书 | 同上 | 确认行 |
| `itranslate.checkpoint_load` | 读场景进度（含 content_hash） | `CheckpointStore`（格式与 CLI 同构） | 状态摘要（completed/failed 块） |
| `itranslate.checkpoint_save` | 写场景进度 | 同上 | 确认行 |
| `itranslate.assemble` | 组装（body_join/first_lock）+ 占位符恢复 + 输出 TXT/MD/EPUB | `AssembleEngine` + `FormatProtector`（golden：assembler.py + format_protector.py 及测试） | 输出路径 + 失配统计 |
| `itranslate.audit` | 漂移审计报告（expected vs observed） | `AuditEngine`（golden：consistency.py audit_all） | 漂移条目数 + 位置清单 |
| `itranslate.status` | 全书进度总览（各场景状态、checkpoint、术语/风格条目数、待审清单） | pipeline 结果 + 文件扫描 | 进度表（纯文本） |

设计要点：

- `assemble` 的失配统计是**质量闸门**：>0 失配即要求 agent 定位重译，不静默通过。
- `audit` 漂移修正闭环：**先改 glossary 契约，再按新契约重译漂移句**（不是只改译文——术语表是契约，同 dsh-translate-docs 的规则）。
- `brief` 让 subagent 不必重读全书：简报自足（正文 + 命中术语 + 风格 + 邻近样例 + 计数要求）。
- 13 个工具的描述各控制在两行内，压低模型上下文成本。

## 5. 文件协议 v1（唯一真相源）

### 5.1 工作区布局

```
<workspace>/
  input/<book>.md                        # 预处理后源文本（## ACT/SCENE 标题 + 标记）
  state/<book>/
    glossary.json                        # 术语表（契约）
    style.json                           # 风格书（人物声音/策略）
    briefs/<scene>__<chunk>.md           # 翻译简报（subagent 工作集）
    drafts/<scene>.md                    # 场景译文草稿（␟/行对齐）
    checkpoints/checkpoint_<slug>__<scene_index:03d>.json   # 与 CLI 同构
    reviews/<scene>.md                   # 人工审校记录（裁定、批注）
  output/<book>/<book>.{txt,md,epub}     # 组装成品
  reports/<book>/audit_*.json            # 审计报告
```

### 5.2 术语表 glossary.json

```jsonc
{
  "version": 1,
  "book": "hamlet",
  "terms": {
    "Elsinore": {"zh": "艾尔西诺", "note": "城堡名", "first_seen": "act1_scene1", "source": "human"},
    "the green light": {"zh": "绿灯", "note": "母题，全书统一", "aliases": ["绿光"], "first_seen": "ch1"}
  },
  "pending": ["to be or not to be"],   // 未定译法，禁止即兴翻译
  "updated_at": "ISO8601"
}
```

规则（继承 dsh-translate-docs 的纪律）：先读后写；**未定术语进 pending，不许即兴造词**；同一原文多译法必须记 alias 候选而非静默漂移；人工裁定后更新契约，译文按契约重译。

### 5.3 风格书 style.json

```jsonc
{
  "version": 1,
  "book": "hamlet",
  "global": {"register": "诗剧，素体诗按行对齐；白话文为主，保留原文修辞密度"},
  "characters": {
    "Hamlet": {"voice": "阴郁多思、机锋锐利", "address": "哈姆雷特"},
    "Polonius": {"voice": "絮叨、谚语堆砌"}
  },
  "policies": {
    "famous_lines": "retranslate",           // 决策 D11：全书自译，经典译本仅审校参考
    "stage_directions": "translate",        // 舞台指示译文用〔〕标注
    "verse": "line_for_line"
  },
  "updated_at": "ISO8601"
}
```

人物声音是 KG"风格区"概念在戏剧上的自然扩展（`kg_get_style_for_paragraph`）。

### 5.4 译文草稿与 checkpoint

- 草稿按 `␟` 对齐（散文句级 / 诗行行级），与 CLI 产物互操作；`§`/`¶` 结构标记保留。
- checkpoint 字段与 CLI 同构（`completed_chunks`/`failed_chunks`/`translations`/`content_hash`/`updated_at`），命名 `checkpoint_<book_slug>__<scene_index:03d>.json`（Hamlet 的"章"= 场；`content_hash` 防源文本变更后续跑错乱）。
- 人工"重译某场" = 删该场 checkpoint + 保留 glossary/style（决策记忆不丢，只重做翻译）。

## 6. 翻译工作流（含人机协作循环）

### 6.1 每场景（Mode A 主线）

```
编排者（主 agent，不自己翻译）
  1. prepare → chunk（写文件，拿结构清单）
  2. 逐场景：
     a. glossary/style 先读（工具）
     b. brief → subagent（简报自足；subagent 读 brief → 翻译 → 写 drafts/<scene>.md → 短报告）
     c. checkpoint_save；人工审（reviews/ 记录裁定）
     d. assemble 试组 → 失配>0 则按失配清单重译对应单元
  3. audit → 漂移修正闭环（改契约 → 重译漂移句 → 复查）
  4. assemble 定稿 + 双语对齐资产导出（Itranslation Q1 的 TM 目标）
```

- 并行：多个场景的 brief→subagent 可并发 fan-out；术语/风格文件写入有顺序约束时串行化或事后 merge。
- 崩溃恢复：重开会话读 `status` + checkpoint 续跑，不依赖"记得"。

### 6.2 Mode B（agent-as-operator）

同一文件协议；agent 用 DSH 内置 bash 工具直跑 Itranslation CLI（`uv run python translate_book.py`，CLI 自带 checkpoint/审计/RAT/反思链），agent 负责编排、术语裁定、审校。LLM 与定价在 Python 侧。**无插件侧子进程（D14）**。

### 6.3 人机协作点（协议层，UI 只是呈现）

| 协作点 | 机制 |
|---|---|
| 术语裁定 | 用户在 chat 裁定 → `glossary_set`/`glossary_merge` 更新契约 → 漂移句重译 |
| 风格/策略 | `style_set`（人物声音、著名台词策略） |
| 逐场审校 | `reviews/<scene>.md` 批注；重译语义 = 删 checkpoint |
| 审计修正 | audit 报告 → 改契约 → 重译 → 复查闭环 |
| 进度 | `itranslate.status` 一键总览 |

## 7. Hamlet 适配（首书专项，事实已核实）

已核实 Itranslation 现状与所需改动（详见 ITRANSLATION-CORE.md §4）：

| # | 事实（已核实，Itranslation 侧） | 影响 | 改动（本仓库 TS 实现，golden 参照 Itranslation） |
|---|---|---|---|
| 1 | `parse_structure` 只认 `CHAPTER/BOOK/PART/Section` 与 `#/##`，不认 `ACT/SCENE`（`src/chunker.py:321-336`） | Hamlet 整本会被识别为 1"章" | `ChunkEngine` 补 `ACT I`/`SCENE II.` 正则 + 人物名行/舞台指示识别 |
| 2 | 句切分面向散文（`\n\n` 分段 + `[.!?]` 边界，`src/chunker.py:99-179`） | 诗行单 `\n` 分隔、行末标点不规则 → 整段独白被并成一句或切碎 | **行模式（verse）**：一行 = 一个对齐单元，行对行翻译 |
| 3 | `scripts/prepare_gutenberg.py` 不存在（scripts/ 仅 check_version.py） | Gutenberg 文本无法直接喂入 | `PrepareEngine` 新建（含戏剧版式：页眉页脚、折行、ACT/SCENE→`##`、人物名行、舞台指示标记） |
| 4 | 组装策略 body_join/first_lock 按句索引对齐 | 行模式下按行索引对齐（更自然） | `AssembleEngine` 加行模式路径（复用同一索引机制） |
| 5 | 术语协议只有"术语→译法" | 戏剧需人物声音、著名台词策略 | style.json 协议（PROTOCOL.md §3.3，本仓库实现） |

设计影响：

- 对齐契约在行模式下变成**行对行**：草稿行数 = 原文行数（含空行/舞台指示行的对应约定），比散文句数对齐更严格也更机械可校验——Hamlet 反而是更友好的验收对象。
- 戏剧三类文本翻译策略不同：台词（素体诗，行对齐）、人物名行（格式标记，不译或统一译名）、舞台指示（`policies.stage_directions` 控制，译文用〔〕包裹）。
- **著名台词策略已拍板（决策 D11）：完全重译**——全书保持单一译者风格，经典译本（朱生豪/梁实秋等）仅作审校参考，不采用、不做对照。
- 双语对齐资产：行对行 + 场景结构 = 天然逐行双语语料，直接对接 Itranslation Q1 的 TM 语料目标。

## 8. 路线图（里程碑制，Hamlet 主线）

| 里程碑 | 内容 | 仓库 | 产出与验收 |
|---|---|---|---|
| **M0** | 设计定稿 + 开发规范：本文档 v2 + 决策 + 调研 + DEVELOPMENT.md（强制规范）+ PROTOCOL.md（协议契约）+ AGENTS.md | 本仓库 | 六文档齐备；D1–D15 定案（含全 TS 不建桥、生态对齐） |
| **M1** | L1：SKILL.md + 文件协议模板 + **Hamlet Act 1 人工在 DSH 会话跑通**（零代码） | 本仓库 | SKILL.md；Act 1 五场草稿（人工按 skill 驱动）；glossary/style v1 实际成形；验证记录 |
| **M2** | TS 确定性原语：`PrepareEngine`（戏剧版式）+ `ChunkEngine`（ACT/SCENE + 行模式）+ `AssembleEngine` + `AuditEngine` + `*Store`；移植 Itranslation 497 行测试为 golden | 本仓库 | 原语单测 + golden 一致性；Itranslation 仓库不动 |
| **M3** | L2：npm 包（照 DSH cookbook 包不变式）+ `cordis.patch.yml` + 13 工具注册（defineTool 契约 + UI 卡片）+ 包内 skill；装入本机 profile 实测；过生态对齐清单 | 本仓库 | 插件包可装可用；工具单测；附录 B 清单全过 |
| **M4** | **Hamlet 全书 E2E**：DSH 会话内 Mode A 翻译全书 → 审计闭环 → 组装 TXT/MD/EPUB | 本仓库 | 0 错误块；审计报告；跨会话续跑验证 |
| **M5（可选）** | Mode A/B 对比（agent 用 bash 工具直跑 Itranslation CLI）；Gatsby 散文路径回归（原验收书）；L3 Web UI；开源化/发布工程 | 本仓库 | 按需启动（对比报告复用 LLM-judge + BLEU/chrF + 人工抽检） |

节奏原则：M1 零代码先验证工作流与协议（最便宜的试错点）；M2 只做 Hamlet 逼出来的最小 TS 原语（golden 测试兜底行为一致性）；M3 才动 DSH 插件机制；M4 一次性给出全书实证。任一里程碑不达预期可在 M1 后低成本掉头。

## 9. 风险与对策（修订）

| 风险 | 对策 |
|---|---|
| 会话上下文被 compaction/spill/pruner 逐出（v1 低估） | 文件为真相源；简报驱动；subagent 写文件+短报告；工具 render 只投影摘要 |
| subagent 整章回传撑爆父上下文 | 同上：回传只许短报告（dsh-translate-docs 实证手法） |
| 句/行数对齐脆弱（agent 自由输出） | 行模式机械可校验；assemble 失配闸门 + 定位重译；M1 人工跑通时验证契约可行性 |
| 会话内翻译 token 成本高 | Mode A 精品定位；M5 对比时量化差价 |
| 会话式翻译不可逐位复现 | glossary/style/checkpoint 文件协议 + 审计；重译语义清晰（删 checkpoint 不丢决策） |
| TS 移植与 Itranslation 行为漂移 | golden 测试（移植 497 行同源测试，注明来源 commit）；协议语义 + golden 裁决分歧；DEVELOPMENT §6 |
| 上游 API 漂移 | 只依赖公开 cordis 契约（`ctx.tools`/`ctx.skills`/`ctx.systemPrompt`/patch 格式）；每里程碑按 RESEARCH-DSH.md §9 清单核查 |
| 生态规范漂移（cookbook 更新） | 上游 cookbook 为准绳（DEVELOPMENT §4 开头）；漂移时先更新本仓库规范再动代码 |
| DSH profile 机制细节变动 | 分发模型与官方唯一路径一致（profile bundle），随上游文档跟踪 |

## 10. 验收标准（分档）

**M1**：Hamlet Act 1 在 DSH 会话中按 SKILL.md 走完（0 代码）：五场草稿行对齐、glossary v1、style v1、验证记录含"契约是否被模型遵守"的实测结论。

**M4**：Hamlet 全书在 DSH 会话端到端翻译（Mode A）：0 错误块、TXT/MD/EPUB 产出、审计闭环全程可用、跨会话续跑不丢进度。

**M5（可选）**：Mode A/B 对比报告（LLM-judge + BLEU/chrF + 人工抽检 + 时间/token）存档。

**通用**：任何时刻重开会话，凭 `status` + 文件协议可无损续跑；术语/风格决策经审计验证为契约一致性来源。
