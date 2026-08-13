# dsh-itranslation

把 [Itranslation](https://github.com/Yisan0429/Itranslation)（AI 全书翻译，本地仓库 `/home/yisan/Itranslation`）做成 **DeepSeek Harness（DSH）插件** 的独立仓库。

> **状态：设计阶段（v2 重估完成），暂不实现。** 本仓库当前只承载决策与设计文档，供后续会话/开发直接接手，无需重做调研。路线图以里程碑 M0–M5 运行（当前 M0 收尾）。

## 一句话定位

DSH 会话的人机协作 + subagents + 文件记忆，配上 Itranslation 的确定性管线（分块/对齐/术语/checkpoint/组装/审计）。**会话上下文只是工作缓存；工作区文件是唯一真相源；管线负责确定性。** 翻译两种模式：Mode A（agent 会话内翻译，精品/交互）/ Mode B（agent 编排，Python 侧调 LLM，批量/可复现）。

## 三仓关系

| 仓库 | 路径 | 角色 |
|---|---|---|
| **dsh-itranslation**（本仓库） | `~/dsh-itranslation` | DSH 插件包：npm + `dsh.bundle.patch` + `itranslate.*` 工具 + SKILL.md，经 `dsh plugin --profile <name> add <git-spec>` 装入本机 DSH profile |
| Itranslation | `~/Itranslation` | Python 确定性核心（chunker/assembler/consistency/checkpoint/glossary/benchmark）+ CLI/GUI；插件经 DSH `ctx.subprocess` seam 调用其 thin CLI（M2 新建 `src/itranslation_api.py`） |
| deepseek-harness（上游） | `~/deepseek-harness` | **只读参考，不 fork、不改** |

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | 决策日志（含未决问题与修订记录），新对话从这里读起 |
| [docs/DESIGN.md](docs/DESIGN.md) | 设计 v2：重写原因、价值主张（Mode A/B、记忆模型）、架构（ctx.subprocess 桥、上下文三闸）、13 工具清单、文件协议、工作流、Hamlet 适配、M0–M5 路线图、风险与验收 |
| [docs/RESEARCH-DSH.md](docs/RESEARCH-DSH.md) | DSH 机制调研 v2：插件/tool/skill/bundle、`ctx.subprocess` 全契约、外部依赖规范（用户点名调研）、上下文三闸与 subagent 回传语义（附 checkout 内文件路径+行号） |
| [docs/ITRANSLATION-CORE.md](docs/ITRANSLATION-CORE.md) | Itranslation 侧现状（v1.5.1）、模块地图、M2 thin CLI 方案、Hamlet 缺口核实（ACT/SCENE、行模式、prepare_gutenberg） |

## 背景摘要（截至 2026-08-14）

- Itranslation 已发布 **v1.5.1**：Q3 提速落地（章节识别解锁并行、推理降档、文学句数策略、RAT 前缀缓存友好、checkpoint 节流、计时观测）。
- Itranslation 的 SOLUTION.md §Q1–Q3 为独立项目自身计划；本仓库的插件设计原为其 Q4，已按"文档分开"决策移出至此。
- **设计 v2 重估**：用户反馈旧路线不满意、要求按 DSH 规范调研 Python 依赖 → 两个调研代理完成核实（DSH 无外部运行时依赖声明机制；规范路径 = `ctx.subprocess` + 路径配置 + 失败即报错）；上下文三闸（spill/pruner/compaction）证伪"全书状态活在会话里"，文件协议升格为真相源。
- **首个端到端验证书 = Hamlet（《哈姆雷特》）**：诗体戏剧逼出 ACT/SCENE 解析、行对齐模式、戏剧版式预处理（M2 落在 Itranslation 仓库）；Gatsby 降级为 M5 可选回归。
- 未决：著名台词策略（默认建议"采用经典译本并注明出处"）；Mode B 是否入 M4 对比矩阵。
