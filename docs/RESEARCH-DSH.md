# DSH 机制调研（2026-08-14 完成）

> 调研对象：`/home/yisan/deepseek-harness`（DSH checkout，只读参考）。本文档让新对话**无需重做调研**；细节核对时按文末路径清单去 checkout 里看。

## 1. 插件模型（Cordis）

- 插件是 TS 模块：导出 `apply(ctx: Context)`（或对象/Service 类形态），通过 `ctx` 注册贡献；`name` 导出仅作显示元数据。
- 加载器按配置树（`cordis.yml` / bundle patch）挂载条目；条目启动并发，顺序靠**服务依赖注入**（inject），不靠配置位置。
- 插件加载失败是"响亮失败"（进程崩），不是跳过；但解析失败（拼写错误）只经 logger 报告，可能被吞——查插件"没生效"先查名字。
- 教程入口：`docs/cordis-tutorial/`（01-first-plugin → 02-lifecycle → 03-services）。
- 三种形态：函数 / 对象（含 apply）/ Service 子类（需暴露服务时用）。

## 2. 模型工具注册（ctx.tools）

- 插件在 `ctx.tools` 注册 `ToolDefinition`：模型可见字段（name/description/parameters schema）+ 必填**规范输出声明**（`output.schema` JSON Schema + `render` 投影）+ `execute(args, exec)`（async，须遵守 `exec.signal` 取消）。
- registry 用 allowlist 构建模型可见 `ToolSchema[]`——output/execute/timeoutMs 等主机字段绝不会泄漏进模型请求。
- 可选：`timeoutMs`（须配合可协作取消的实现）、`finalizeContent`（最后一英里变换）、`presentCall/presentResult`（UI 呈现）。
- 权威文档：`docs/subsystems/tools.md`（全字段说明）；现成范本：`packages/extensions/tool-cordis/`（自我指涉工具集，含 schema/prompt/present 拆分模式）。
- 工具包命名惯例：`@deepseek-ai/dsh-tool-*`，位于 `packages/*/tool-*`（tool-bash、tool-fs、tool-subagent、tool-workflow、tool-goal、tool-skill、tool-web 等）。

## 3. Skill 体系

- Skill = Markdown + YAML frontmatter：`name`、`description`、`disable-model-invocation`（禁止模型自动加载，仅显式调用）、`user-invocable`（用户可点名调用）。
- **本地发现优先级**（`docs/subsystems/skills.md`）：

| rank | 来源 | 根 |
|---|---|---|
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | `Config.customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills` |
| 500 | user-agents | `<agentsHome>/skills` |
| 600 | bundled | `Config.bundledSkillDir`（可选配置） |

- projectRoot = 最近含 `.git` 的祖先目录（无则用 cwd）。
- 提供者分 host 层与 per-scope 层注册（`ctx.skills`），同名近层优先；`tool-skill` 发布模型可见的 `skill` 加载工具。
- 现成范本：`.agents/skills/dsh-translate-docs/SKILL.md`——文档翻译工作流 skill（关键手法：**编排 agent 不自己翻译，spawn subagent 翻译**；术语表是契约，先读后译；skill 本身是"工作流地图"而非翻译记忆）。

## 4. 外部插件分发：profile bundle（唯一官方路径）

- 来源：`2026-08-09-remove-repository-plugin.md`（`.dsh-plugin` 路径已移除）、`2026-08-05-profile-plugin-bundles.md`。
- 模型：**profile** = `$DSH_HOME/profiles/<name>/`（package.json，pnpm 管理 out-of-tree 依赖 + `dsh.profile` 声明有序 `bundles` 列表）+ 用户 `cordis.patch.yml`。
- **bundle** = npm 包声明 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`；补丁层按 `dsh.profile.bundles` 顺序应用到空根上，之后是用户层与 `--patch` 覆盖。
- 安装：`dsh plugin --profile <name> add <package-or-git-spec>`（pnpm 转发器，初始化 profile 并协调 bundles 列表）。
- 行解析双锚：bundle 名从 dsh 安装处解析（内置包不经 pnpm），插件裸名经 profile 目录 Node 父级遍历 → `$DSH_HOME/profiles/node_modules`。
- **结论**：本仓库作为 git spec 装入 profile，包内 `cordis.patch.yml` 挂载我们的插件行（id + name + config）。
- 相关：profile 里还可让 bundle 贡献 skill（挂 `dsh-skill-filesystem` 指向包内资源）与 MCP server。

## 5. 子进程对接（Python 桥）

- bash 工具的 `ShellExecRequest`/`ShellExecSpec` 支持 `stdin?: string` 与 `env?: Record<string,string>`（`2026-06-30-bash-stdin-env-trusted-plugin-api.md`）。
- 语义：模型可见工具**不含** stdin/env 参数（防泄漏）；受信任进程内调用者（如插件）可直接设字段——插件包 Python 子进程可走这条 seam（参考其 scrub/env 合并顺序：`scrub(process.env)` → `ENV_OVERRIDES` → 普通 `env` → `dshEnv`）。
- 另一条路：插件直接用 Node `child_process` 长驻 `python -m itranslation.api`（P1 产物），不走模型工具路径。

## 6. 超长文本能力（用户动机所指）

- DSH 具备 `packages/compaction/`（会话压缩，含 compaction-tool-result-pruner 等）与 `packages/context/`——长会话自动压缩但保留关键决策。
- agent 工具集里有 subagent（含上下文继承的 fork 与独立任务）、workflow（多代理编排）、goal（持久目标）、文件工具、job（后台任务）。
- 翻译场景组合拳：subagents 章节并行 + 工作区文件做持久记忆 + compaction 保住全局决策。

## 7. Web GUI 与客户端插件（L3 用）

- DSH Web GUI 运行在 `http://127.0.0.1:3080`（本机）。外壳 = `apps/web` Vite 入口，仅 `dsh web` 注入 `window.__DSH_BOOT__`。
- 客户端插件包：声明 `dsh.client` 清单（`{platform, inject, immediately?}`），共享 tsdown 预设产出 `lib/client.js` + `exports["./client"]`；宿主由 `packages/bundle/web-app/cordis.patch.yml` 的 roster 组装（`2026-07-23-client-plugin-loading-model.md`）。
- 客户端插件改动需要 `pnpm run dev:web`（从 DSH checkout）在跑以重编译 bundle；`apps/web` 外壳与普通包改动须重建后刷新页面。
- 命令注册：`packages/interaction/commands`（`/` 斜杠命令注册表，`2026-07-19-plugin-command-registration.md`）——插件可贡献人类命令（不经模型）。

## 8. 关键路径清单（核对细节时用）

```
deepseek-harness/
├── docs/cordis-tutorial/            # 插件入门（01-first-plugin 等）
├── docs/cordis-api/                 # cordis API
├── docs/subsystems/skills.md        # skill 发现/加载
├── docs/subsystems/tools.md         # ToolDefinition 全字段
├── docs/subsystems/compaction.md    # 压缩
├── .agents/skills/dsh-translate-docs/SKILL.md   # 翻译工作流 skill 范本
├── .agents/notes/implemented/architecture/
│   ├── 2026-08-05-profile-plugin-bundles.md
│   ├── 2026-07-23-client-plugin-loading-model.md
│   └── 2026-06-30-bash-stdin-env-trusted-plugin-api.md
├── .agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md
├── .agents/notes/implemented/simplification/2026-08-09-remove-repository-plugin.md
├── packages/core/tools/             # 工具注册表
├── packages/skill/{skill,skill-filesystem,tool-skill}/
├── packages/extensions/tool-cordis/ # 工具插件范本
└── packages/bundle/{base,web-app,headless}/   # 组成（cordis.patch.yml）
```
