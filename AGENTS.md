# AGENTS.md

本仓库是 Itranslation（整本书翻译生产线）的 DSH 插件实现。设计看 [DESIGN.md](./DESIGN.md)，规范看 [DEVELOPMENT.md](./DEVELOPMENT.md)；本文档把它们整理成可执行守则，不新增规范。

## 一、翻译任务守则（九步工作流）

用户选 Itranslation preset 交书后按此执行（源自 DESIGN §3/D65/D70）。确定性操作必须走插件工具（工具会校验前置产物，不齐即拒绝，D38）；LLM 只出现在预读、翻译、审查、修订，一律走 DSH `llm` 路由与子代理，禁止自建 API 客户端。

| 步 | 做什么 | 工具/手段 | 落盘 |
|---|---|---|---|
| 0 | 只问目标语言（体裁/风格/术语模式不问） | ask_user_question | —（停点①） |
| 1a | 录入：读 `input/<书>.md`，识别 `##` 章边界，落原文备份与章结构 | itranslation_prepare | `source/<n>.md`、`state.json` |
| 1b | 预读：派一个子代理读全书，**直接**写最终 `style.md` 与 `glossary.json`（无草案、无单独统一样式步） | subagent | `style.md`、`glossary.json` |
| 2 | 术语确认：`glossary.json` 生成后停下，用户可编辑；等确认才翻译 | ask_user_question | —（停点②） |
| 3 | 分段：只读报告；超长章停下告知，不自动分片、不静默调整 | itranslation_segment | — |
| 4 | 逐章翻译：一章一个子代理（独立上下文）；任务只注入该章文本，子代理直读 `style.md`/`glossary.json`；译文落盘 | subagent + 文件工具 | `chapters/<n>.md`（超长分片 `<n>.<k>.md`） |
| 5 | 组装校验：写 `aligned.md` 预览；失配返回 `ok:false` 时停下询问用户 | itranslation_align | `aligned.md` |
| 6a | 全书审查：独立子代理对照 `source/<n>.md` 按段定位问题，产报告 | subagent | `audit-report.md` |
| 6b | 报告交用户过目，问是否修订 | ask_user_question | —（停点③） |
| 7 | 修订：只重译报告指出的问题段（不按章重跑）；术语改动回写并留痕 | subagent + itranslation_glossary | 修订译文、`glossary.json` |
| 8 | 出成品：须 `state.json`/`chapters/`/`audit-report.md` 齐全；`processes` 记录各 LLM 过程 | itranslation_assemble | `output/<slug>.md`、`meta.json` |

硬规则：

- **每次运行必产 `meta.json`**；中断后回原会话继续，跨会话不自动恢复（D36）。
- 术语表一经确认即锁定；修订改动必须回写并留痕。
- 工作目录：`input/` 进、`books/<slug>/` 工作、`output/<slug>.md` 出（D70）。

工具速查（下划线命名，D67）：`itranslation_prepare` 录入 / `itranslation_segment` 分段报告 / `itranslation_glossary` 术语表 / `itranslation_align` 组装校验 / `itranslation_assemble` 出成品 / `itranslation_status` 进度摘要（随时可查）。

## 二、仓库开发守则（零例外）

1. **红线**（DEVELOPMENT §2.7）：不改 `~/deepseek-harness`（只读参考）；不改部署 shipped preset（复制副本）；无 Python 依赖、不建 subprocess 桥；不绕过 DESIGN §6 四类约束；不做成本闸；不新增第五份仓库文档。
2. **代码红线**（§2.4）：访问服务 `ctx.get(name)` + undefined 检查，`inject` 仅硬依赖；副作用可逆（`ctx.effect`/`ctx.on`/官方 disposer）；注册前先 Inspect 查真实 API；Host/Client 只走私有 JSON RPC、只传 lossless JSON；模型调用走 DSH `llm` 路由与子代理。
3. **决策闸**：设计决策变更 → DEVELOPMENT「决策日志」追加 D 条目，与代码同提交；确需违规，先加决策、后改规范、再动代码。
4. **覆盖率纪律**：`packages/*/*/src` 逐文件 100%（语句/分支/函数/行）；types-only（`src/types.ts`）豁免；API 桶文件承载真实契约常量，不得退化为纯 re-export。
5. **提交纪律**：conventional commits；钩子会拦不合规提交，不要用 `--no-verify` 绕过。

## 三、命令与工程约定速查

```bash
pnpm install            # 依赖 + git 钩子
pnpm run build          # 双面构建（tsc -b + tsdown）
pnpm run typecheck      # host + client 聚合类型检查
pnpm run lint           # oxlint；lint:fix 自动修复
pnpm run test:coverage  # 单测 + 逐文件 100% 覆盖率闸
pnpm run hygiene        # knip + publint（先 build）
pnpm run duplication    # jscpd
node scripts/install-web-deploy.mjs [--apply]  # web 部署链入（幂等）
```

- **双面构建**：Host 面 `tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host`；Client 面同理；client 包 tsdown 用共享 `clientBundle` preset（D66）。
- **测试归属**：client 浏览器侧测试 `packages/itranslation/client/tests/*.client.spec.ts`（host 聚合排除、client 聚合包含），其余归 host 聚合。
- **pnpm store**：`.npmrc` 指向仓库内 `.pnpm-store/`（沙箱适配），别删这行带 node_modules 提交。
- **harness 对齐**：版本组合与 harness 一致；DSH 包用 `link:` devDependencies 指 `~/deepseek-harness` 已构建包（只读）；不确定先查 harness 再写实现。
- **client 设置页**：命名空间注册在 client Host 半边（D68）；浏览器经 `/_dsh/itranslation/settings` 读写（D69）；视觉对齐 harness 设计语言（D66，`--dsw-alias-*` token）。
- **当前状态**：引擎/工具/UI/部署均已落地；唯一未闭合为端到端冒烟验收（D39，当场人工检查不存档）。
