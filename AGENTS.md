# AGENTS.md

本仓库是 DeepSeek Harness（DSH）插件 `dsh-itranslation` 的设计与实现仓库。所有 AI 会话与本仓库的交互必须遵守 `docs/DEVELOPMENT.md`（开发规范，强制）。

## 新会话必读顺序

1. `README.md` —— 定位、三仓关系、文档索引
2. `docs/DECISIONS.md` —— 决策日志 D1–D15（未决问题在文末）
3. `docs/PROTOCOL.md` —— 协议契约（文件协议/对齐契约，唯一权威）
4. `docs/DESIGN.md` —— 设计 v2（按需读相关章节）
5. `docs/DEVELOPMENT.md` —— 开发规范（红线 R1–R9、生态对齐、gates）
6. `docs/RESEARCH-DSH.md`、`docs/ITRANSLATION-CORE.md` —— 调研结论（含上游文件路径+行号）

## 铁律

- **docs-first**：改代码前先改文档；新决策先落 `DECISIONS.md`（D# 编号）。
- **完全按 DSH 插件生态**（决策 D15）：包结构/工具契约/README 结构以 `/home/yisan/deepseek-harness/docs/cookbook/` 三件套为准绳（只读，不 fork 不改）。
- **全 TypeScript、零外部进程**（决策 D14）：无 Python 依赖、无 `child_process`、无生命周期脚本。
- 上游 checkout 只读；Itranslation 仓库（`/home/yisan/Itranslation`）在 M1–M4 期间不动。
- 会话内约定不算数：一切约定必须落档并提交。
