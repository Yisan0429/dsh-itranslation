# AGENTS.md

本仓库是 Itranslation（整本书翻译生产线）的 DSH 插件实现。规范唯一来源是 [DEVELOPMENT.md](./DEVELOPMENT.md)，设计唯一依据是 [DESIGN.md](./DESIGN.md)；本文档只给出 agent 工作守则，不新增规范。

## 守则（零例外）

1. **红线清单**（DEVELOPMENT.md §2.7）：不改 `~/deepseek-harness` 任何文件（只读参考）；不改部署 shipped preset（只复制副本）；无 Python 依赖、不建 subprocess 桥；不绕过 DESIGN.md §6 四类约束；每次翻译运行必产 `meta.json`；不做成本闸；不新增第五份仓库文档。
2. **代码红线**（§2.4）：访问服务用 `ctx.get(name)` + undefined 检查，`inject` 仅用于硬依赖；一切副作用可逆（`ctx.effect` / `ctx.on` / 官方 disposer）；注册前先 Inspect 查询真实 API；Host/Client 只走 Package 私有 JSON RPC，仅传 lossless JSON；模型调用一律走 DSH `llm` 路由与子代理，禁止自建 API 客户端或硬编码第三方端点。
3. **决策闸**：任何设计决策变更 → DEVELOPMENT.md「决策日志」追加 D 条目，与代码同提交。确需违反规范时：先追加决策、后修改规范、再动代码。
4. **覆盖率纪律**：`packages/*/*/src` 逐文件 100%（语句/分支/函数/行）。types-only 文件（`src/types.ts`）豁免；API 桶文件不得退化为纯 re-export（v8 无法度量），需承载真实契约常量。
5. **提交纪律**：conventional commits；钩子会拦下不合规提交，不要用 `--no-verify` 绕过。

## 工作目录约定（D70）

翻译在会话 workspace 的三个固定目录间流转（详见 DESIGN.md §5.5）：

- `input/` — 用户放入 E2M 转出的 Markdown，`prepare` 从这里取书（`path` 传 `input/<文件>.md`）；
- `books/<slug>/` — 书级工作目录：`state.json`、`source/<n>.md`、`chapters/<n>.md`（分片 `<n>.<k>.md`）、`glossary.json`、`style.md`、`aligned.md`、`audit-report.md`、`meta.json`；
- `output/<slug>.md` — 最终成品（`assemble` 写入，books/ 中不含成品）。

六个模型可见工具统一下划线命名（D67）：`itranslation_prepare` / `itranslation_segment` / `itranslation_glossary` / `itranslation_align` / `itranslation_assemble` / `itranslation_status`。LLM 四处（预读/翻译/审查/修订）不在工具面，由 agent 直接调 DSH `llm` 服务与子代理完成（D26）。

## 常用命令（根目录）

```bash
pnpm install            # 依赖 + 自动安装 git 钩子
pnpm run build          # 双面构建（tsc -b + tsdown）
pnpm run typecheck      # host + client 聚合类型检查
pnpm run lint           # oxlint；pnpm run lint:fix 自动修复
pnpm run test:coverage  # 单测 + 逐文件 100% 覆盖率闸
pnpm run hygiene        # knip + publint（先 build）
pnpm run duplication    # jscpd 重复代码
node scripts/install-web-deploy.mjs [--apply]  # web 部署链入 dry-run/落盘（幂等）
```

## 工程约定速览

- **双面构建**：Host 面 `tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host`；Client 面同理。client 包的 `tsdown.config.ts` 替换 workspace 默认，必须同时重述 node 半边与 browser 半边（浏览器 bundle 经共享 `clientBundle` preset 产出，D66）。
- **测试归属**：client 包浏览器侧测试放 `packages/itranslation/client/tests/*.client.spec.ts`（host 聚合排除、client 聚合包含），其余测试归 host 聚合；覆盖率闸逐文件 100%。
- **pnpm store**：`.npmrc` 把 store 指向仓库内 `.pnpm-store/`（沙箱适配），不要删掉这行后带 `node_modules` 状态提交。
- **harness 对齐**：版本组合（Node/pnpm/TS6/oxlint/tsdown/vitest）与 harness 保持一致；DSH 包以 `link:` devDependencies 指向 `~/deepseek-harness` 已构建包（只读引用，红线 1/2）；不确定的约定先查 `~/deepseek-harness`（只读），再写实现。
- **client 设置页**：`itranslation` 命名空间注册在 client 包 Host 半边（D68）；浏览器经插件自有同源路由 `/_dsh/itranslation/settings` 读写（D69，浏览器 settings 线有 apiproxy 白名单、插件命名空间不可达）；视觉对齐 harness 设计语言（D66）：`*.module.css` + `--dsw-alias-*` token，禁止手写 `className` 或绕开 CSS Module 管线。

## 当前里程碑

- `core`：确定性引擎。`slugify`（D42）、`segmentParagraphs`/`countSentences`（D22/D24）、`detectChapters`/`normalizeMarkdown`/`createBookState`/`assembleBook`（D56/D57）；书籍先经 E2M 转 Markdown，书名 `#`、章 `##`、节 `###`；`state.json` 只记章结构，组装按原文/译文空行比对段数，失配抛错由工具层询问。
- `tools`：六个确定性工具（D58）与书级状态文件；输入经 `input/`、成品经 `output/`（D70）。
- `client`：Run 卡进度（keyed `tool.call.toolview`×6）与提示词设置页（四个 LLM 提示词文本框，D61/D65）；设置命名空间注册在 client Host 半边（D68）、经插件自有路由读写（D69）。
- 部署链入：host 六工具经 preset 绝对路径行挂载、client 浏览器半边经部署端 file: 依赖 + cordis.patch.yml insert 进入模块表（D63/D64），3080 可用。
- 里程碑验收（D39）：样本短书跑通九步冒烟并产出 `meta.json`，当场人工检查、不存档——唯一未闭合里程碑。
