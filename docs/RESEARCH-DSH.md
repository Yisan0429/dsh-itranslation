# DSH 机制调研（2026-08-14，两轮完成，v2）

> 调研对象：`/home/yisan/deepseek-harness`（DSH checkout，只读参考）。本文档让新对话**无需重做调研**；细节核对时按文末路径清单去 checkout 里看。
> v2 增补：外部依赖规范（用户点名要求）、上下文三闸（spill/pruner/compaction）、subagent 回传语义、`ctx.subprocess` seam 全契约、profile/bundle 精确机制。所有结论附文件路径+行号。

## 1. 插件模型（Cordis）

- 插件是 TS 模块：导出 `apply(ctx, config)`（或对象/Service 类形态），通过 `ctx` 注册贡献；`name` 导出仅作显示元数据。配置用 schemastery：`static Config = z<Config>`，默认值在构造前填好（范本 `packages/shell/tool-bash/src/index.ts:39-42,190`）。
- 加载器按配置树（`cordis.yml` / bundle patch）挂载条目；条目启动并发，顺序靠**服务依赖注入**（inject），不靠配置位置。同名服务重复加载抛错（cordis 标准行为，`vendor/cordis/src/reflect.ts:289-290`）。
- 插件加载失败是"响亮失败"（进程崩）；解析失败（拼写错误）可能只经 logger 报告——查插件"没生效"先查名字。
- 教程入口：`docs/cordis-tutorial/`；cookbook：`docs/cookbook/extension-cookbook.md`。
- **运行环境**：ESM（根 `package.json:6` `"type":"module"`）；Node `^22.19.0 || >=24.0.0`（`package.json:8-9`）；ESM 下 `__dirname` 不可用，官方写法 `fileURLToPath(new URL('../package.json', import.meta.url))`（`apps/cli/src/profile-boot.ts:54`）。

## 2. 模型工具注册（ctx.tools）

- 插件在 `ctx.tools` 注册 `ToolDefinition`（`docs/subsystems/tools.md:13-93`）：模型可见字段（name/description/parameters schema）+ **必填规范输出声明**（`output.schema` JSON Schema + `render(args, value): ContentBlock[]` 投影 + 可选 `presentationMeta`）+ `execute(args, exec)`（async，须遵守 `exec.signal` 取消）。
- **allowlist**（`tools.md:11`）：`schemas()` 只漏 `name/description/parameters` 进模型请求——output/execute/timeoutMs/isConcurrencySafe/present* 永不泄漏。
- 可选：`timeoutMs`（须配合可协作取消）、`finalizeContent`（最后一英里变换）、`presentCall/presentResult`（UI 呈现）、`isConcurrencySafe`（并行组资格）。
- **设计要点（本插件用）**：`render` 是上下文预算阀门——canonical 值可携带完整数据（供程序/后续工具消费），模型只看到 render 投影的短摘要。
- 范本注意：`tool-cordis` **不在** `packages/bundle/*/cordis.patch.yml` 里，而在 agent preset `apps/cli/config/agent-presets/cordis/agent.cordis.yml:245-246` 挂载。
- 工具包命名惯例 `@deepseek-ai/dsh-tool-*`，按域嵌套（`packages/shell/tool-bash`、`packages/fs/tool-fs`、`packages/subagent/tool-subagent` 等）。

## 3. Skill 体系

- Skill = Markdown + YAML frontmatter：`name`、`description`、`disable-model-invocation`（禁自动加载）、`user-invocable`（用户可点名调用）。
- 本地发现优先级（`docs/subsystems/skills.md:68-76`，实现 `packages/skill/skill-filesystem/README.md`）：

| rank | 来源 | 根 |
|---|---|---|
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | `Config.customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills` |
| 500 | user-agents | `<agentsHome>/skills` |

- projectRoot = 最近含 `.git` 的祖先目录（无则 cwd）。`skill-filesystem` 需 `inject: ['skills']`，可设 `includeDefaultRoots:false` + `customSkillDirs` 做隔离 provider——**bundle 贡献 skill 的路径**：插件自行注册 provider 指向包内目录（bundle 内指向随包文件目前无声明式路径原语，见 §6）。
- 现成范本 `.agents/skills/dsh-translate-docs/SKILL.md`（详见 §7 的要点提炼）。

## 4. 外部插件分发：profile bundle（唯一官方路径）

- 来源：`2026-08-09-remove-repository-plugin.md`（`.dsh-plugin` 路径已移除）、`2026-08-05-profile-plugin-bundles.md`。
- **bundle 声明**（`packages/bundle/base/package.json:36-40`）：`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`；类型定义 `packages/boot/app-boot/src/profile.ts:41-62`（`DshBundleManifest`/`DshProfileManifest`/`DshManifestSection`，注释明确"other consumers own additional keys"——**launcher 只消费 `bundle.patch` 与 `profile.bundles` 两个键，其余全是留给第三方的命名空间**）。patch 文件靠标准 npm `files` + `exports` 子路径随包分发。
- **profile 机制**（`profile.ts` + `profile-boot.ts`）：`$DSH_HOME/profiles/<name>/` = package.json（`dsh.profile.bundles` 有序列表）+ 用户 `cordis.patch.yml` + `pnpm-workspace.yaml`（`packages:[.]`、`nodeLinker:hoisted`、`autoInstallPeers:false`，`profile.ts:138-143`）。层序（`profile-boot.ts:142-171`）：bundle 层按 bundles 顺序 → profile 自身 patch → `$DSH_HOME/cordis.patch.yml` → `--patch` overlay，应用在**空 root** 上；行按 id 后写覆盖、整行 `config` 替换不 merge。
- **cordis.patch.yml 行格式**：`- insert: - {id, name, config?, disabled?, inject?}`；`!!js` 表达式可运行时求值（如 `root: !!js dshHomePath('sessions')`）。
- **安装**：`dsh plugin --profile <name> add <git-spec>`（`apps/cli/src/plugin.ts:120-158`）= 初始化 profile 后 `spawnSync('pnpm', args, {cwd: profileDir})` 原样转发 pnpm；成功后 `reconcilePlugins` 把声明 `dsh.bundle.patch` 的依赖按序加进 `dsh.profile.bundles`。git spec 且 pnpm ≥10 拦 prepare 时给出 `allowBuilds` 提示（`plugin.ts:149-155`）。
- **双锚解析**（`profile.ts:344-355`）：bundle 名先从 dsh 安装处解析（内置包不经 pnpm），裸名经 profile 目录 Node 父级遍历 → `$DSH_HOME/profiles/node_modules`（`healProfilesModuleFallback` 每次 boot 维护的扁平 symlink fallback，`profile.ts:223-255`）→ 插件 import 的 peer 依赖（cordis、dsh-subprocess 等）命中安装处单例，**不要自带重复实例**。

## 5. 子进程 seam（ctx.subprocess）——Python 桥的唯一规范路径

- 抽象服务 `@deepseek-ai/dsh-subprocess`（`ctx.subprocess`）+ 本地实现 `dsh-subprocess-local`；文档 `docs/subsystems/subprocess.md`，note `2026-07-26-subprocess-seam.md`。服务抽象可被子类化注册（"load the subclass as a plugin"，subprocess.md 末尾 catalog 说明）——**外部 bundle 插件可 inject 使用**。
- **`resolveExecutable(command, env?, signal?)`**（`packages/subprocess/subprocess/src/index.ts:118-122`；本地实现 `subprocess-local/src/index.ts:104-144`）：绝对路径做 X_OK 校验；裸名走**scrub 后 PATH + 显式 env 覆盖**（Windows 加 PATHEXT）；带分隔符的相对路径直接拒绝；缺失报 `command ... was not found on PATH` / `is not an executable file`——这是官方"外部工具发现"通用辅助模块。
- **`spawn(spec)`**：spec 全显式（`argv`/`cwd`/`stdio`/`graceMs`/`abort?`/`env?`，subprocess.md:100-133）；**argv 不经 shell**（要 shell 语义自己传 `['bash','-c',…]`）；stdio Node 形：`'pipe'`（协议帧，LSP JSON-RPC/ACP ndjson 用）/`'inherit'`/collect（`{maxBytes, spill?}`，偏移读、读不消费、溢出可溢出文件）；`terminate()` 唯一终止动词，SIGTERM→graceMs→SIGKILL，**树级**；服务 disposal 终止全部在管进程。
- **env scrub**（`scrubbedParentEnv`，`subprocess/src/index.ts:44-66`）：剔除 `/KEY|PASSWORD|SECRET|TOKEN/i` 与 `DSH_*`；**PATH/HOME/locale/proxy 保留**（python/uv 正常定位）；显式 `env` 在 scrub 后合并。
- **bash stdin/env 受信任 seam**（`2026-06-30-bash-stdin-env-trusted-plugin-api.md`）：`ShellExecRequest` 有 `stdin?/env?/dshEnv?`，但**模型面向的 bash 工具不暴露**（`packages/shell/tool-bash/src/index.ts:342-348`）；受信任进程内调用者可设。合并顺序：scrub → ENV_OVERRIDES → 普通 env → dshEnv（`bash-local/src/index.ts:196`）。插件跑 python 可走此路（会包一层 bash -c）或直走 `ctx.subprocess.spawn`（无 shell，推荐）。
- **先例**：ripgrep（`packages/fs/tool-fs-search/src/search-core.ts:171-174,227-237` 懒 import `@vscode/ripgrep` 取 `rgPath` → `ctx.subprocess.spawn`）、claude-code（`packages/subagent/subagent-claude-code/src/index.ts:42-44,69-73` 用 `Config.env` 覆盖 `resolveExecutable('claude', …)` 查找环境——**"配置字段覆盖二进制路径"的现成样板**）。
- **结论**：本插件 Python 桥 = `resolveExecutable(pythonPath)` + `spawn(argv 直调)` + cordis.patch.yml `config:` 暴露 `pythonPath/itranslationDir` + 失败即报错（详见 DESIGN.md §3.2）。

## 6. 外部运行时依赖的"规范"（用户点名调研，结论）

**DSH 没有一等公民方式声明插件的外部运行时依赖（python/系统二进制）**：`dsh` 段只有 `bundle.patch`/`profile.bundles` 两键（`profile.ts:41-62`）。三条既有惯例：

1. **`ctx.subprocess.resolveExecutable` + 配置/env 覆盖 + 缺失即失败**（最贴合现有 seam；claude-code 样板）。坑：scrub 剔 key/token 与 `DSH_*`（敏感变量须显式 `env`）；`cwd` 必须显式指定（默认 `process.cwd()`）。
2. **npm 生命周期脚本**（`dsh-subprocess-local/package.json:35` 的 `postinstall` 先例）。坑：pnpm ≥10 默认拦 git 依赖 prepare/build（`plugin.ts:149-155` 预埋提示）；install 期需 uv/网络可用。**本方案不采用**。
3. **打包二进制**（ripgrep 路线：`2026-08-01-packaged-ripgrep-search.md` 明确把"文档化 host 依赖"评为下策）。坑：逐平台构建、体积、必须懒 `import()`（静态 import 平台包缺失会搞挂整个 Loader 组合，`search-core.ts:158-174`）。个人项目过度工程，**暂不采用**；将来开源分发时是升级路径。

- 官方 grep：`python` 在 docs/.agents 里全部指 DSH 的 Python SDK（`python/`、`docs/user/guide/python-sdk.md`），**没有**"JS 插件依赖本地 Python 项目"的先例或指引——本设计采用惯例 1 是最贴近规范的选择。
- 命名覆盖缺口（`2026-08-09-remove-repository-plugin.md:40,44`）：bundle 内指向随包静态资源（skill/MCP 文件）**目前没有声明式路径原语**，插件要用 `import.meta.url` 自算包根。

## 7. 上下文预算与 subagent（对翻译设计最关键的事实）

- **spill**：工具结果 >50KB 落盘、模型只见文件引用。
- **tool-result-pruner**：>8KB 的工具结果只留头尾。
- **compaction**（`docs/subsystems/compaction.md` + `packages/compaction/`）：旧区间 LLM 摘要化，只保留 ~16% 尾部原文。
- **结论**：逐字译文/大块正文**必然被逐出会话上下文**——"全书状态活在会话里"不成立。译文全文必须落工作区文件；模型只见元数据/短报告（DESIGN.md §3.1）。
- **subagent 返回语义**（`docs/subsystems/subagent.md:316-335`）：父代理收到的是**最后一次非空 assistant 消息全文**（非摘要）——fan-out 若整章回传会撑爆父上下文。正确姿势：subagent 写文件 + 短报告。范本 `.agents/skills/dsh-translate-docs/SKILL.md:38,53`：**编排者不自己翻译，spawn subagent 翻译；结果写文件**。
- dsh-translate-docs skill 要点提炼（本插件 SKILL.md 的直接范本）：
  1. skill 是"工作流地图"而非翻译记忆；术语表是**契约**——未列术语进待定清单（「待定术语」），**不许即兴造词**；
  2. **简报驱动委派**：编排者为 subagent 备好完整工作集（简报），subagent 不重读全库、不重推 diff；
  3. 审校裁定落到**术语表（契约）**而非只改一处译文；
  4. 两遍纪律：先按语感译，再逐条对照源文核对；成稿自读一遍；
  5. 完成须有"记录确认"步（hash 配对验证），可审计。
- subagents（fork 上下文继承）/workflow（多代理编排）/goal（持久目标）/文件工具/后台 job 的常规能力与翻译场景组合拳：subagents 单元并行 + 工作区文件持久记忆 + compaction 保决策（决策在文件里，不在压缩摘要里）。

## 8. Web GUI 与客户端插件（L3 用）

- DSH Web GUI 运行在 `http://127.0.0.1:3080`（本机）。外壳 = `apps/web` Vite 入口，仅 `dsh web` 注入 `window.__DSH_BOOT__`。
- 客户端插件包：`dsh.client` 清单（`{platform, inject, immediately?}`），共享 tsdown 预设产出 `lib/client.js` + `exports["./client"]`；宿主由 `packages/bundle/web-app/cordis.patch.yml` 的 roster 组装（`2026-07-23-client-plugin-loading-model.md`）。
- 客户端插件改动需要 `pnpm run dev:web`（从 DSH checkout）在跑以重编译 bundle；`apps/web` 外壳与普通包改动须重建后刷新页面。
- 命令注册：`packages/interaction/commands`（`/` 斜杠命令，`2026-07-19-plugin-command-registration.md`）。

## 9. 关键路径清单（核对细节时用）

```
deepseek-harness/
├── docs/cordis-tutorial/  docs/cordis-api/  docs/cookbook/extension-cookbook.md
├── docs/subsystems/tools.md            # ToolDefinition 全字段
├── docs/subsystems/subprocess.md       # ctx.subprocess 契约（spawn/resolveExecutable）
├── docs/subsystems/skills.md           # skill 发现/加载
├── docs/subsystems/compaction.md       # 压缩
├── docs/subsystems/subagent.md:316-335 # subagent 返回语义
├── .agents/skills/dsh-translate-docs/SKILL.md   # 翻译工作流 skill 范本（简报驱动）
├── .agents/notes/implemented/architecture/
│   ├── 2026-08-05-profile-plugin-bundles.md
│   ├── 2026-07-26-subprocess-seam.md
│   ├── 2026-07-23-client-plugin-loading-model.md
│   └── 2026-06-30-bash-stdin-env-trusted-plugin-api.md
├── .agents/notes/implemented/feature/
│   ├── 2026-08-01-packaged-ripgrep-search.md     # 打包二进制决策（依赖规范先例）
│   └── 2026-07-19-plugin-command-registration.md
├── .agents/notes/implemented/simplification/2026-08-09-remove-repository-plugin.md
├── packages/boot/app-boot/src/profile.ts          # dsh 段类型/双锚/fallback
├── packages/subprocess/subprocess/src/index.ts    # SubprocessRuntime 抽象
├── packages/subprocess/subprocess-local/src/index.ts  # 本地实现（X_OK/PATH/spawn）
├── packages/fs/tool-fs-search/src/search-core.ts  # 打包二进制 + subprocess spawn 先例
├── packages/subagent/subagent-claude-code/src/index.ts  # Config.env 覆盖查找先例
├── apps/cli/src/plugin.ts                         # dsh plugin add 实现
├── apps/cli/config/agent-presets/cordis/agent.cordis.yml  # tool-cordis 挂载处
└── packages/bundle/{base,web-app,headless}/       # 组成（cordis.patch.yml 行格式样例）
```
