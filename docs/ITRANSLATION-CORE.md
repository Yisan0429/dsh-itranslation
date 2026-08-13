# Itranslation 核心现状与 headless 接口方案（插件侧视角）

> 本文档面向插件开发者，说明 Itranslation 仓库（`/home/yisan/Itranslation`）的现状、模块地图，以及 P1（headless 接口）的设计草案。Itranslation 自身的计划见其 `SOLUTION.md`。

## 1. 现状（v1.5.1，2026-08-14 已提交）

- Python 3.11+，uv 管理依赖，pytest 54 项全绿，CI = ruff + pytest + benchmark --quick + 版本检查。
- v1.5.1 提速改动（与插件相关者）：
  - `parse_structure` 识别普通书章节头（`CHAPTER I`/`Chapter 1`/`BOOK TWO`/`PART III` 等，`src/chunker.py`）
  - 自动并行上限 8（`max_parallel_workers`）、向量库单写队列 `SafeVectorStore`（`src/vector_store.py`）
  - 推理档位默认全 low；`on_count_mismatch_literature` 默认 warn、±1 句差容忍（`src/translator.py`）
  - RAT 上下文在 user prompt（system 全书恒定，前缀缓存友好）
  - checkpoint 节流（每 10 块 + 章末 + 失败立即）+ 计时观测（`api_calls/api_sec/count_retries/cache_hit_tokens/phases`）

## 2. 模块地图（插件需要复用的确定性原语）

| 模块 | 关键函数 | 插件工具对应 |
|---|---|---|
| `src/chunker.py` | `chunk_text`（句级分块+重叠）、`parse_structure`（章节识别）、`Chunk`（body/context 句、body_sentence_count、long_sentence） | `itranslate.chunk` |
| `src/extractor.py` | `extract_book`（pdf/epub/txt/md）、`extract_text`（多编码） | `itranslate.prepare`（+ Gutenberg 预处理） |
| `src/assembler.py` | `assemble_translations`（body_join/first_lock，按 ␟ 切句对齐）、`assemble_book`（txt/md/pdf/epub 输出）、`sentence_mismatch_count` | `itranslate.assemble` |
| `src/format_protector.py` | `protect`/`restore`（代码/公式/URL 占位符） | assemble 链内 |
| `src/consistency.py` | `ConsistencyModel`（expected/observed 计数、`audit_all` 漂移检测、load/save/merge） | `itranslate.glossary` + `itranslate.audit` |
| `src/translator.py` | `translate_chapter`（LLM 调用链，**插件模式不用**）、`_save_checkpoint`/`_load_checkpoint`（JSON 落盘，含 content_hash） | `itranslate.checkpoint`（复用文件格式） |
| `src/pipeline.py` | `run_translation_pipeline`（CLI/GUI 共用编排）、`checkpoint_path_for`（按书 slug + 章节索引命名）、`slugify` | 参考其编排语义 |

关键约定（插件必须遵守，才能与 CLI 产物互操作）：
- 句子分隔符 `␟`（`SENTENCE_SEPARATOR`）；译文每句一行，句数对齐正文句。
- checkpoint JSON 字段：`completed_chunks` / `failed_chunks` / `translations` / `content_hash` / `updated_at`；文件命名 `checkpoint_<book_slug>__<chapter_index:03d>.json`。
- 输出目录：`output/<book>/`；报告：`reports/consistency/`。

## 3. P1：headless JSON 接口（草案，实现落在 Itranslation 仓库）

目标：把上述原语做成幂等、无状态可测的命令，CLI 与插件共用；插件翻译模式不依赖 `src/translator.py` 的 LLM 链。

入口：`python -m itranslation.api`（或 `uv run python -m itranslation.api`），stdin/stdout **JSON 行协议**：

```jsonc
// 请求（每行一个）
{"id": 1, "op": "chunk", "args": {"text": "...", "target_tokens": 1500, "max_tokens": 3000, "overlap_sentences": 3}}
// 响应
{"id": 1, "ok": true, "result": {"chunks": [{"id": "chunk_0000", "body": "...", "context": "...", "body_sentence_count": 5, "long_sentence": false}]}}
{"id": 1, "ok": false, "error": "..."}
```

算子草案：

| op | args | result |
|---|---|---|
| `prepare` | `path`, `format`（可选 gutenberg 预处理开关） | 归一化 markdown 文本 + 章节列表 |
| `chunk` | `text`, `target_tokens`, `max_tokens`, `overlap_sentences` | chunk 列表（body/context/句数） |
| `glossary_get` / `glossary_set` / `glossary_merge` | `book`（slug）, `terms` | 术语表快照（DESIGN.md §4 文件协议） |
| `checkpoint_load` / `checkpoint_save` | `book`, `chapter_index`, `data` | checkpoint 状态（CLI 同构） |
| `assemble` | `book`, `chapters`（各章 chunks + 译文句数组）, `format`, `out` | 输出文件路径 + 句数失配统计 |
| `audit` | `book` | 漂移报告（复用 consistency 模型） |

约束：每 op 幂等；不持有全局状态（checkpoint/glossary 都在文件里）；错误以 `ok:false + error` 返回，进程不退出；支持 `--once`（处理完 stdin 即退出）与长驻两种模式。
测试：与 CLI 同源单测（chunker/assembler/consistency 已覆盖），新增行协议序列化与幂等测试。

## 4. 插件翻译模式下的工作流（P2/P3 时生效）

```
agent: prepare → chunk（全书分章分块，写入 workspace 文件）
agent: 逐章/并行 spawn subagent 翻译（会话内 LLM；每块输出 ␟ 分隔句，句数对齐）
agent: glossary 文件随翻译增补（先读后写，经 itranslate.glossary）
agent: 每章/每 N 块 checkpoint_save（崩溃可续跑）
agent: assemble → 成品 + 失配统计；audit → 漂移报告 → 人工/agent 修正
```
