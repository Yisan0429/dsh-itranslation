# Itranslation 核心现状与行为参照（v3，2026-08-14）

> 本文档面向插件开发者，说明 Itranslation 仓库（`/home/yisan/Itranslation`）的现状、模块地图（**TS 移植的 golden 来源**）、Hamlet 缺口核实。
> **v3 变更（D14/D15）**：插件全 TS 且不建桥——Itranslation 仓库在 M1–M4 **不动**；本仓库 TS 实现确定性原语，行为一致性靠移植其同源测试为 golden（DEVELOPMENT §6）。§3 thin CLI 方案降级为 **Mode B 议题的预留知识**（当前不实现）。
> Itranslation 自身的计划见其 `SOLUTION.md`。

## 1. 现状（v1.5.1，2026-08-14 已提交）

- Python 3.11+，uv 管理依赖，pytest 54 项全绿，CI = ruff + pytest + benchmark --quick + 版本检查。
- 入口 `translate_book.py`（仓库根），用两行 `sys.path.insert`（`<repo>`、`<repo>/src`，`translate_book.py:24-27`）解决扁平模块导入——Mode B 直跑 CLI 时无需任何新代码。
- v1.5.1 提速改动（与插件相关者）：
  - `parse_structure` 识别普通书章节头（`CHAPTER I`/`Chapter 1`/`BOOK TWO`/`PART III`/`Section 3`，`src/chunker.py:321-336`）
  - 自动并行上限 8（`max_parallel_workers`）、向量库单写队列 `SafeVectorStore`
  - 推理档位默认全 low；`on_count_mismatch_literature` 默认 warn、±1 句差容忍
  - RAT 上下文在 user prompt（system 全书恒定，前缀缓存友好）
  - checkpoint 节流（每 10 块 + 章末 + 失败立即）+ 计时观测

## 2. 模块地图（TS 移植的 golden 来源）

| 模块 | 关键函数 | 插件工具对应 |
|---|---|---|
| `src/chunker.py` | `chunk_text`（句级分块+重叠）、`parse_structure`（章节识别）、`Chunk`（body/context 句、body_sentence_count、long_sentence） | `ChunkEngine`（golden：chunker.py + test_chunker.py） |
| `src/extractor.py` | `extract_book`（pdf/epub/txt/md）、`extract_text`（多编码） | `PrepareEngine` 仅取文本路径语义（PDF/EPUB 逻辑插件模式不需要） |
| `src/assembler.py` | `assemble_translations`（body_join/first_lock，按 ␟ 切句对齐）、`assemble_book`（txt/md/pdf/epub）、`sentence_mismatch_count` | `AssembleEngine`（golden：assembler.py + test_assembler.py） |
| `src/format_protector.py` | `protect`/`restore`（代码/公式/URL 占位符） | `FormatProtector`（golden：format_protector.py + 测试） |
| `src/consistency.py` | `ConsistencyModel`（expected/observed 计数、`audit_all` 漂移检测、`merge_model`） | `GlossaryStore` + `AuditEngine`（golden：consistency.py + test_consistency.py） |
| `src/translator.py` | `translate_chapter`（LLM 调用链，**插件不用**）、`_build_translation_prompt`（提示词工艺 → `BriefRenderer` 工艺参照）、`_save/_load_checkpoint` | `BriefRenderer` / `CheckpointStore`（格式同构） |
| `src/pipeline.py` | `run_translation_pipeline`（CLI/GUI 共用编排）、`checkpoint_path_for`（按书 slug + 章节索引）、`slugify` | 编排语义参照；Mode B 经 bash 直跑它 |
| `src/kg_builder.py` | `kg_to_glossary`、`kg_get_style_for_paragraph`（风格区） | style.json 协议的概念来源（`StyleStore`） |
| `src/term_extractor.py` | `extract_terms_batch`（LLM 候选术语抽取） | Mode B 可选：agent 跑 CLI 时人工裁定候选术语 |

关键约定（TS 实现必须遵守，才能与 CLI 产物互操作）：
- 句子分隔符 `␟`（`SENTENCE_SEPARATOR`，`src/assembler.py:14`）；译文按 ␟ 切分对齐正文句。
- 提示词工艺（`translator.py:548-597`，`BriefRenderer` 的工艺参照）：system = 角色 + 语言对 + 体裁 + 风格指令 + 术语命中；user = 计数契约 + Context 只读段 + 邻近样例 + 正文；超长句有专门放行条款（插件模式无向量库，邻近样例用"已译草稿摘录"替代 RAT 检索）。
- checkpoint JSON 字段：`completed_chunks`/`failed_chunks`/`translations`/`content_hash`/`updated_at`；命名 `checkpoint_<book_slug>__<chapter_index:03d>.json`（`pipeline.py:21-24`）。
- 输出目录 `output/<book>/`；报告 `reports/consistency/`、`reports/benchmark/`。
- 质量评估资产可复用：BLEU/chrF + LLM-judge（`src/benchmark.py:79-115`），M5 对比报告直接用它。

## 3. thin CLI 接口 ——【预留：Mode B 议题，当前不实现（D14）】

> 原方案（单次调用 `itranslation_api.py <op> --json` + `ctx.subprocess` 桥）已随 D14 取消。若未来 Mode B 需要类型化编排，先重开决策（DECISIONS），再按 RESEARCH-DSH.md §5/§6 补全。当前 Mode B 形态 = agent 用内置 bash 工具直跑 `uv run python translate_book.py`（CLI 自带 checkpoint/审计/RAT），插件侧零进程。
> op 语义与 PROTOCOL.md §2.1 表格一致（形状对 TS 工具同样有效）；Itranslation 侧行为以本仓库 golden 测试为对齐点（§2）。

## 4. Hamlet 缺口核实（首书专项，2026-08-14 已核实）

| # | 事实（Itranslation 侧） | 出处 | 需要的改动（本仓库 TS 实现） |
|---|---|---|---|
| 1 | `parse_structure` 不认 `ACT/SCENE`，Hamlet 会被识别为 1"章" | `src/chunker.py:321-336`（正则仅 chapter/book/part/section） | `ChunkEngine` 补 `ACT I`/`SCENE II.` 正则（短行约束防误伤正文） |
| 2 | 句切分面向散文：`\n\n` 分段 + `[.!?]` 边界 | `src/chunker.py:99-179` | 行模式（verse）：一行 = 一个对齐单元；`\n` 行边界即单元边界，`[.!?]` 不再切 |
| 3 | `prepare_gutenberg.py` 不存在 | `scripts/` 仅 `check_version.py` | `PrepareEngine` 新建；戏剧版式处理：页眉页脚清理、折行合并、ACT/SCENE→`##`、人物名行（`HAMLET.` 独占行）标记、舞台指示识别 |
| 4 | 组装按句索引（body_join/first_lock） | `src/assembler.py:29-60` | `AssembleEngine` 行模式按行索引对齐（复用同一索引机制，加 mode 参数） |
| 5 | 提示词计数契约是句数 | `translator.py:571-588` | `BriefRenderer` 行模式改为行数契约（更机械可校验） |
| 6 | 术语抽取/风格区面向散文 | `term_extractor.py`、`kg_builder.py` | 戏剧下人物声音/著名台词进 style.json（PROTOCOL.md §3.3，本仓库实现） |

戏剧版式要点（`PrepareEngine` 的验收样例）：Gutenberg #2265 Hamlet 纯文本的页眉页脚、行折行、`ACT I`/`SCENE II.` 行、人物名行与舞台指示（原版多斜体/括号）需要归一为可机读标记（如 `@SPEAKER: HAMLET`、`[stage]` 前缀或原文标记），保证行对齐的单元语义正确。

## 5. 插件翻译模式下的工作流（M1/M4 时生效）

```
Mode A: prepare → chunk（行模式）→ 逐场景: brief → subagent（读简报→翻译→写 drafts→短报告）
        → checkpoint_save → assemble 试组（失配闸门）→ audit → 漂移修正 → 定稿
        （全部 TS 原语 + 内置 subagent/文件工具，零外部进程）
Mode B（M5 可选）: agent 用内置 bash 工具直跑 `uv run python translate_book.py`
        （CLI 自带质量链/checkpoint/审计；agent 只编排/裁定/审校）
```
