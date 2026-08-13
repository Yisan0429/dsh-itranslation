# 设计：Itranslation as DSH 插件

> 状态：设计定稿（2026-08-14），实现按路线图按需启动。

## 1. 价值主张

Itranslation 独立 CLI（v1.5.1）的架构是「逐块无状态 LLM 调用 + 注入式上下文」（glossary/RAT 拼接进 prompt）。确定性来自隔离，代价是全局上下文只能靠注入、无法自然累积——第 9 章的翻译不知道第 3 章的译法，只能靠术语表近似。

DSH 的 agent 会话具备：**长上下文 + compaction（压缩但保留关键决策）+ subagents（章节并行 fan-out）+ 工作区文件记忆 + Web GUI 人机协作**。插件化后：

- **全书状态活在会话里**：人物表、术语决策、风格基调、已译章节全文；翻译后续章节时前面章节真的"记得"。
- **确定性交给管线**：分块/句对齐、glossary 文件协议、checkpoint、组装、审计仍由 Itranslation 的 Python 核心执行。
- 分工一句话：**agent 负责理解，管线负责记忆与确定性**。

双模式定位（互补不互斥）：

| | 独立 CLI（Itranslation） | DSH 插件模式（本仓库） |
|---|---|---|
| 场景 | 批量、便宜、可复现的规模生产 | 交互式、全局一致的精品翻译、人机协作 |
| 一致性来源 | glossary 注入 + 一致性模型审计 | 会话长上下文 + 同样用管线审计兜底 |
| 成本 | batch API、前缀缓存、并行 | 会话内翻译，token 更贵 |
| 可复现性 | 高（checkpoint + 确定性管线） | 低（靠文件协议 + 审计保证跨会话一致） |

两者共用同一 Python 核心（Itranslation 仓库）。

## 2. 三层形态（投入递增）

### L1 — Skill（零 DSH 改动）

`SKILL.md`（Markdown + frontmatter：name/description/disable-model-invocation/user-invocable）教 agent 全书翻译工作流：

1. Gutenberg 预处理（页眉页脚清理、折行合并、`CHAPTER I` → `## ` 转换；Itranslation 侧计划有 `scripts/prepare_gutenberg.py`，未实现前 skill 里给手动步骤）
2. 章节 fan-out：subagent 翻译各章（上下文继承）
3. 术语表文件协议：`glossary.json` 读写（见 §4）
4. 一致性审计（Itranslation 的 `src/consistency.py`，CLI 跑或 headless 接口跑）
5. 组装出版（TXT/MD/EPUB）

只用现有工具（bash/read/write/subagent/workflow），不动 DSH。加载方式：DSH skill 发现机制（项目根 `.dsh/skills`，rank 100；或 `Config.customSkillDirs`）——本仓库/工作区携带即可。

### L2 — 工具插件包（核心价值）

独立 npm 包（本仓库），`"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`，经 `dsh plugin --profile <name> add <git-spec>` 装入 DSH profile。注册模型工具（`ctx.tools`，`ToolDefinition`：schema + `execute(args, exec)` + 规范输出）：

| 工具 | 功能 | 对应 Itranslation 模块 |
|---|---|---|
| `itranslate.prepare` | Gutenberg/纯文本预处理（页眉页脚、折行、章节头归一） | extractor + chunker.parse_structure |
| `itranslate.chunk` | 句级分块 + 重叠（返回 chunk 元数据与正文句） | chunker |
| `itranslate.glossary` | 术语表文件协议读写（get/set/merge，按书 slug 存储） | consistency 的 glossary 快照 + 新文件协议 |
| `itranslate.checkpoint` | 进度持久化读写（按书 slug + 章节索引，含 content_hash） | translator._save_checkpoint / pipeline.checkpoint_path_for |
| `itranslate.assemble` | 句对齐组装（body_join/first_lock）+ 占位符恢复 + 格式输出 | assembler + format_protector |
| `itranslate.audit` | 一致性漂移审计报告 | consistency.audit_all / generate_consistency_report |

**插件自己不调 LLM**（决策 D5）：翻译由 agent 在会话内做；插件只提供确定性骨架与记忆。

Python 侧配套（落在 Itranslation 仓库，路线图 P1）：`python -m itranslation.api`，stdin/stdout JSON 行协议暴露上述原语为幂等命令；插件经 Node `child_process` 长驻调用（DSH 的 bash seam 已有 `stdin`/`env` 支持，可参考）。

### L3 — Web 客户端 UI 插件（远期）

DSH Web GUI（`http://127.0.0.1:3080`）里的书籍翻译面板：章节进度、续跑、审计视图、双语对照。需要 `dsh.client` 客户端插件包 + `./client` bundle。

## 3. 架构

```
DSH 会话（agent，长上下文 + compaction）
 ├─ skill: itranslate-book（工作流指令）
 ├─ tools: itranslate.prepare/chunk/glossary/checkpoint/assemble/audit
 │         └─ 子进程: python -m itranslation.api（确定性核心，幂等 JSON 行协议）
 ├─ subagents: 章节翻译 fan-out（上下文继承 + 各自汇报）
 └─ 工作区文件（跨会话持久记忆）:
     input/<book>.md · glossary/<book>.json · cache/checkpoint_* · output/<book>/
```

## 4. 术语表文件协议（草案，P1 时定稿）

```jsonc
// glossary/great-gatsby.json（按书 slug 存储，agent 与工具共同维护）
{
  "version": 1,
  "book": "great-gatsby",
  "terms": {
    "the green light": {"zh": "绿灯", "note": "母题，全书统一", "first_seen": "ch1"},
    "East Egg": {"zh": "东卵", "note": "地名"}
  },
  "updated_at": "ISO8601"
}
```

规则：agent 翻译时**先读后写**（新增术语须经工具校验格式）；同一英文术语多译法必须记 alias 候选而非静默漂移；审计工具对比"工具记录的期望译法 vs 实际译文"产生漂移报告（复用 Itranslation consistency 的 expected/observed 模型）。

## 5. 路线图（按需启动）

| 阶段 | 内容 | 仓库 | 产出 |
|---|---|---|---|
| P1 | Python headless 接口：`--json` 子命令 / `python -m itranslation.api` 暴露 chunker/assembler/consistency/checkpoint/glossary 原语（幂等、可测，CLI 与插件共用） | Itranslation | 单元测试 + 行协议文档 |
| P2 | L1 SKILL.md + 人工在 DSH 会话中跑通短书一章 | 本仓库 | SKILL.md + 工作流验证记录 |
| P3 | L2 插件包：`dsh.bundle.patch` + 工具注册 + 子进程桥，装入本机 DSH profile 实测 | 本仓库 | npm 包 + 工具单测 |
| P4 | 实证：Gatsby 全书在 DSH 会话中端到端翻译，与独立 CLI 对比质量/时间/token | 两仓库 | 对比报告（入 Itranslation `reports/benchmark/`） |
| P5 | L3 Web UI 插件（可选） | 本仓库 | 客户端 bundle |

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 会话内翻译 token 成本高（无 batch 折扣、无前缀缓存纪律） | 批量/便宜场景留 CLI；DSH 模式定位精品/交互；实证 P4 量化差价 |
| 会话式翻译不可逐位复现 | glossary/checkpoint 文件协议 + 审计工具保证跨会话一致；关键章节可清 checkpoint 重跑 |
| 上游 API 漂移 | 只依赖公开 cordis 契约与 `ctx.tools`/`ctx.skills` API；不 fork DSH |
| 子进程桥复杂度（Node↔Python 生命周期、错误传递） | 长驻子进程 + 请求/响应关联 id + 超时；P1 先做无状态单次调用版本 |
| Itranslation 仓库演进与插件脱节 | headless 接口带版本号；插件仓库 pin Itranslation commit/tag |

## 7. 验收标准（P4 时生效）

1. Gatsby（Gutenberg #64317，约 4.7 万词）在 DSH 会话中端到端翻译：0 错误块、产出 TXT/MD/EPUB。
2. 与独立 CLI 的对比数据：质量（LLM-judge + 人工抽检）、时间、token，报告存档。
3. 术语漂移审计全程可用（工具化），跨会话续跑不丢进度。
