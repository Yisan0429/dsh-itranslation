# Itranslation 核心现状与插件侧接口方案（v2，2026-08-14）

> 本文档面向插件开发者，说明 Itranslation 仓库（`/home/yisan/Itranslation`）的现状、模块地图，以及 M2（thin CLI）的设计草案。Itranslation 自身的计划见其 `SOLUTION.md`。
> v2 变更：原 P1"长驻 JSON 行协议"降级为**单次调用 thin CLI**（长驻是可选优化）；新增 §4 Hamlet 缺口核实（首书专项）。

## 1. 现状（v1.5.1，2026-08-14 已提交）

- Python 3.11+，uv 管理依赖，pytest 54 项全绿，CI = ruff + pytest + benchmark --quick + 版本检查。
- 入口 `translate_book.py`（仓库根），用两行 `sys.path.insert`（`<repo>`、`<repo>/src`，`translate_book.py:24-27`）解决扁平模块导入（`from chunker import …` 风格）——**新 thin CLI 照抄此机制即可，无需重构包结构**。
- v1.5.1 提速改动（与插件相关者）：
  - `parse_structure` 识别普通书章节头（`CHAPTER I`/`Chapter 1`/`BOOK TWO`/`PART III`/`Section 3`，`src/chunker.py:321-336`）
  - 自动并行上限 8（`max_parallel_workers`）、向量库单写队列 `SafeVectorStore`
  - 推理档位默认全 low；`on_count_mismatch_literature` 默认 warn、±1 句差容忍
  - RAT 上下文在 user prompt（system 全书恒定，前缀缓存友好）
  - checkpoint 节流（每 10 块 + 章末 + 失败立即）+ 计时观测

## 2. 模块地图（插件需要复用的确定性原语）

| 模块 | 关键函数 | 插件工具对应 |
|---|---|---|
| `src/chunker.py` | `chunk_text`（句级分块+重叠）、`parse_structure`（章节识别）、`Chunk`（body/context 句、body_sentence_count、long_sentence） | `itranslate.chunk` |
| `src/extractor.py` | `extract_book`（pdf/epub/txt/md）、`extract_text`（多编码） | `itranslate.prepare`（+ Gutenberg 预处理） |
| `src/assembler.py` | `assemble_translations`（body_join/first_lock，按 ␟ 切句对齐）、`assemble_book`（txt/md/pdf/epub）、`sentence_mismatch_count` | `itranslate.assemble` |
| `src/format_protector.py` | `protect`/`restore`（代码/公式/URL 占位符） | assemble 链内 |
| `src/consistency.py` | `ConsistencyModel`（expected/observed 计数、`audit_all` 漂移检测、`merge_model`） | `itranslate.glossary_*` + `itranslate.audit` |
| `src/translator.py` | `translate_chapter`（LLM 调用链，**Mode A 不用，Mode B 用**）、`_build_translation_prompt`（提示词工艺 → `itranslate.brief` 复用）、`_save/_load_checkpoint` | `itranslate.checkpoint_*` / `itranslate.brief` |
| `src/pipeline.py` | `run_translation_pipeline`（CLI/GUI 共用编排）、`checkpoint_path_for`（按书 slug + 章节索引）、`slugify` | 参考其编排语义（Mode B 直接调它） |
| `src/kg_builder.py` | `kg_to_glossary`、`kg_get_style_for_paragraph`（风格区） | style.json 协议的概念来源（`itranslate.style_*`） |
| `src/term_extractor.py` | `extract_terms_batch`（LLM 候选术语抽取） | Mode B 可选：候选术语 → 人工裁定进 glossary |

关键约定（插件必须遵守，才能与 CLI 产物互操作）：
- 句子分隔符 `␟`（`SENTENCE_SEPARATOR`，`src/assembler.py:14`）；译文按 ␟ 切分对齐正文句。
- 提示词工艺（`translator.py:548-597`，`brief` 工具直接复用的资产）：system = 角色 + 语言对 + 体裁 + 风格指令 + 术语命中；user = 句数契约 + Context 只读段 + RAT 样例（top-k 相似已译段）+ 正文；超长句有专门放行条款。
- checkpoint JSON 字段：`completed_chunks`/`failed_chunks`/`translations`/`content_hash`/`updated_at`；命名 `checkpoint_<book_slug>__<chapter_index:03d>.json`（`pipeline.py:21-24`）。
- 输出目录 `output/<book>/`；报告 `reports/consistency/`、`reports/benchmark/`。
- 质量评估资产可复用：BLEU/chrF + LLM-judge（`src/benchmark.py:79-115`），M4 对比报告直接用它。

## 3. M2：thin CLI 接口（草案，实现落在 Itranslation 仓库）

目标：把确定性原语做成**单次调用、幂等、可测**的命令，CLI 与插件共用；不引入长驻进程与协议复杂度（纯计算原语无模型加载，单次调用秒级）。

入口：`src/itranslation_api.py`（单文件，照抄 `translate_book.py:24-27` 的 sys.path 机制）：

```bash
python <itranslationDir>/src/itranslation_api.py <op> [--json] [args...]
python <itranslationDir>/src/itranslation_api.py --version
```

- `--json`：结果单行 JSON 到 stdout（`{"ok":true,"result":...}` / `{"ok":false,"error":"..."}`），错误不崩溃、退出码 0/1 区分。
- `--version`：输出版本 + Itranslation commit 前缀（插件启动探针用）。
- 插件侧经 `ctx.subprocess.spawn` 单次调用（argv 直传、collect stdio、graceMs、exec.signal），**无长驻进程**。

算子草案（与原 P1 相同但形态更薄）：

| op | args | result |
|---|---|---|
| `prepare` | `path`, `--gutenberg`（戏剧版式开关） | 归一化 markdown 路径 + 结构列表 |
| `chunk` | `text_path`, `mode=prose|verse`, `target_tokens`, `overlap` | chunks 文件 + 单元元数据 |
| `brief` | `chunk_id`, `book`, `--rat-top-k` | 简报文本（契约+正文+命中+样例+计数） |
| `glossary_get/set/merge` | `book`, `terms` | 术语表快照/确认行/增改删计数 |
| `style_get/set` | `book`, `patch` | 风格书读写 |
| `checkpoint_load/save` | `book`, `scene_index`, `data` | checkpoint 状态（CLI 同构） |
| `assemble` | `book`, `scenes`, `mode`, `format`, `out` | 输出路径 + 失配统计 |
| `audit` | `book` | 漂移报告（复用 consistency 模型） |

约束：每 op 幂等；状态全在文件（checkpoint/glossary/style）；错误 `ok:false` 返回。
测试：与 CLI 同源单测（chunker/assembler/consistency 已覆盖）+ 新增行协议序列化与幂等测试。
**长驻模式（可选优化，非 M2 范围）**：若将来单次调用开销成为瓶颈，再加 `--daemon`（stdin/stdout ndjson 帧 + 请求关联 id，仿 ACP 后端；需超时与重启策略）。原 P1 的"长驻 JSON 行协议"整体后移。

## 4. Hamlet 缺口核实（首书专项，2026-08-14 已核实）

| # | 事实 | 出处 | 需要的改动 |
|---|---|---|---|
| 1 | `parse_structure` 不认 `ACT/SCENE`，Hamlet 会被识别为 1"章" | `src/chunker.py:321-336`（正则仅 chapter/book/part/section） | 补 `ACT I`/`SCENE II.` 正则（短行约束防误伤正文） |
| 2 | 句切分面向散文：`\n\n` 分段 + `[.!?]` 边界 | `src/chunker.py:99-179` | 行模式（verse）：一行 = 一个对齐单元；`\n` 行边界即单元边界，`[.!?]` 不再切 |
| 3 | `prepare_gutenberg.py` 不存在 | `scripts/` 仅 `check_version.py` | 新建；戏剧版式处理：页眉页脚清理、折行合并、ACT/SCENE→`##`、人物名行（`HAMLET.` 独占行）标记、舞台指示识别 |
| 4 | 组装按句索引（body_join/first_lock） | `src/assembler.py:29-60` | 行模式按行索引对齐（复用同一索引机制，加 mode 参数） |
| 5 | 提示词计数契约是句数 | `translator.py:571-588` | 行模式改为行数契约（更机械可校验） |
| 6 | 术语抽取/风格区面向散文 | `term_extractor.py`、`kg_builder.py` | 戏剧下人物声音/著名台词进 style.json（协议在本仓库设计，Python 侧仅读写） |

戏剧版式要点（prepare_gutenberg 的验收样例）：Gutenberg #2265 Hamlet 纯文本的页眉页脚、行折行、`ACT I`/`SCENE II.` 行、人物名行与舞台指示（原版多斜体/括号）需要归一为可机读标记（如 `@SPEAKER: HAMLET`、`[stage]` 前缀或原文标记），保证行对齐的单元语义正确。

## 5. 插件翻译模式下的工作流（M1/M4 时生效）

```
Mode A: prepare → chunk（行模式）→ 逐场景: brief → subagent（读简报→翻译→写 drafts→短报告）
        → checkpoint_save → assemble 试组（失配闸门）→ audit → 漂移修正 → 定稿
Mode B: prepare → chunk → translate_chapter（Python 侧 LLM，CLI 质量链）→ assemble → audit
        （agent 只编排/裁定/审校；checkpoint 与 CLI 完全同构，可互相续跑）
```
