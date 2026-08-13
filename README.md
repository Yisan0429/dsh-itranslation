# dsh-itranslation

把 [Itranslation](https://github.com/Yisan0429/Itranslation)（AI 全书翻译，本地仓库 `/home/yisan/Itranslation`）的**确定性翻译管线思想**做成 **DeepSeek Harness（DSH）插件** 的独立仓库。

> **状态：设计阶段（M0 收尾），暂不实现。** 本仓库当前只承载决策与设计文档，供后续会话/开发直接接手，无需重做调研。路线图以里程碑 M0–M5 运行。
> **架构定调（D14/D15）**：插件 **100% TypeScript、零外部进程、完全按 DSH 插件生态**（官方 cookbook 为准绳）；与 Itranslation 共享的是**文件协议**而非代码。

## 一句话定位

DSH 会话的人机协作 + subagents + 文件记忆，配上插件内置的 TS 确定性原语（分块/对齐/术语/checkpoint/组装/审计）。**会话上下文只是工作缓存；工作区文件是唯一真相源；确定性交给插件原语（协议与 Itranslation 产物互操作）。** 翻译两种模式：Mode A（agent 会话内翻译，精品/交互）/ Mode B（agent 用 bash 工具直跑 Itranslation CLI，批量/可复现，M5 可选）。

## 三仓关系

| 仓库 | 路径 | 角色 |
|---|---|---|
| **dsh-itranslation**（本仓库） | `~/dsh-itranslation` | DSH 插件包（纯 TS 单包）：npm + `dsh.bundle.patch` + `itranslate.*` 13 工具 + SKILL.md，经 `dsh plugin --profile <name> add <git-spec>` 装入本机 DSH profile |
| Itranslation | `~/Itranslation` | 协议互操作的另一方 + **golden 测试来源**（其 chunker/assembler/consistency 测试移植为本仓库 fixtures）；M1–M4 不动；Mode B 时 agent 直跑其 CLI |
| deepseek-harness（上游） | `~/deepseek-harness` | **只读参考，不 fork、不改**；其 `docs/cookbook/` 三件套是生态对齐准绳 |

## 文档索引（新会话必读顺序）

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | 会话交接铁律与必读顺序（AI 协作入口） |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 决策日志 D1–D15（含修订记录与未决问题） |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | **开发规范（强制）**：docs-first、里程碑 gate、commit 规范、**DSH 生态对齐规范（cookbook 派生 + 红线 R1–R9 + 附录 B 对齐清单）**、质量闸门、会话交接 |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | **协议契约（唯一权威）**：op/工具契约与错误码表、glossary/style/checkpoint/drafts 文件 schema、␟ 对齐契约、版本兼容（thin CLI §2 为 Mode B 预留） |
| [docs/DESIGN.md](docs/DESIGN.md) | 设计 v2：重写原因、价值主张（Mode A/B、记忆模型）、架构（TS 原生原语、上下文三闸）、13 工具清单、文件协议、工作流、Hamlet 适配、M0–M5 路线图、风险与验收 |
| [docs/RESEARCH-DSH.md](docs/RESEARCH-DSH.md) | DSH 机制调研 v2：插件/tool/skill/bundle、官方 cookbook、上下文三闸与 subagent 回传语义；§5/§6（subprocess/依赖规范）为 Mode B 预留知识 |
| [docs/ITRANSLATION-CORE.md](docs/ITRANSLATION-CORE.md) | Itranslation 侧现状（v1.5.1）、模块地图（TS 移植 golden 来源）、Hamlet 缺口核实（ACT/SCENE、行模式、戏剧版式） |

## 背景摘要（截至 2026-08-14）

- Itranslation 已发布 **v1.5.1**（Q3 提速落地）；其 SOLUTION.md §Q1–Q3 为独立项目自身计划，本仓库原为其 Q4 移出（D4）。
- **设计 v2 重估 + 三连拍板**：路线图改里程碑制（Hamlet 主线）；D14 **全 TS 且不建桥**（共享边界=协议，`ctx.subprocess` 桥取消，调研结论留档）；D15 **完全按 DSH 插件生态**（cookbook 三件套为准绳，工具链/包结构/工具契约/README 结构全对齐）。
- 上下文三闸（spill/pruner/compaction）证伪"全书状态活在会话里"→ 文件协议为唯一真相源。
- **首个端到端验证书 = Hamlet（《哈姆雷特》）**：ACT/SCENE 解析、行对行对齐、戏剧版式预处理全部在本仓库 TS 实现（M2），著名台词完全重译（D11）；Gatsby 降级为 M5 可选回归。
- 唯一未决：L2 包内 skill 的分发形态（M3 时定）。
