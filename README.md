# dsh-itranslation

把 [Itranslation](https://github.com/Yisan0429/Itranslation)（AI 全书翻译，本地仓库 `/home/yisan/Itranslation`）做成 **DeepSeek Harness（DSH）插件** 的独立仓库。

> **状态：设计阶段，暂不实现。** 本仓库当前只承载决策与设计文档，供后续会话/开发直接接手，无需重做调研。

## 一句话定位

DSH 的 agent 会话有长上下文 + compaction + subagents + 文件记忆，能"记得"全书状态；Itranslation 的 Python 管线提供确定性（句级对齐、术语文件、checkpoint、组装、审计）。插件让 **agent 负责理解与翻译，管线负责记忆与确定性**。

## 三仓关系

| 仓库 | 路径 | 角色 |
|---|---|---|
| **dsh-itranslation**（本仓库） | `~/dsh-itranslation` | DSH 插件包：npm + `dsh.bundle.patch` + `itranslate.*` 工具 + SKILL.md，经 `dsh plugin --profile <name> add <git-spec>` 装入本机 DSH profile |
| Itranslation | `~/Itranslation` | Python 确定性核心（chunker/assembler/consistency/checkpoint/glossary/benchmark）+ CLI/GUI；插件通过子进程调用其 headless 接口 |
| deepseek-harness（上游） | `~/deepseek-harness` | **只读参考，不 fork、不改** |

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | 决策日志（含未决问题），新对话从这里读起 |
| [docs/DESIGN.md](docs/DESIGN.md) | 完整设计：价值主张、三层形态、工具清单、子进程协议、路线图、风险 |
| [docs/RESEARCH-DSH.md](docs/RESEARCH-DSH.md) | DSH 插件/skill/tool/bundle 机制调研结论（2026-08-14 完成，附 checkout 内关键文件路径） |
| [docs/ITRANSLATION-CORE.md](docs/ITRANSLATION-CORE.md) | Itranslation 侧现状（v1.5.1）、模块地图、headless 接口方案（P1） |

## 背景摘要（截至 2026-08-14）

- Itranslation 已发布 **v1.5.1**：Q3 提速落地（章节识别解锁并行、推理降档、文学句数策略、RAT 前缀缓存友好、checkpoint 节流、计时观测）。详情见其 CHANGELOG 与 SOLUTION.md。
- Itranslation 的 SOLUTION.md §Q1–Q3 为独立项目自身计划；本仓库的插件设计原为其 Q4，已按"文档分开"决策移出至此。
- 插件设计引用 Itranslation 的实证计划（公版书 Gatsby E2E），但两者各自演进，互不阻塞。
