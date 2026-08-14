# DEVELOPMENT（开发规范与决策日志）

> 仓库文档有且仅有四份，均置于主目录：`README.md`、`AGENTS.md`、`DESIGN.md`、`DEVELOPMENT.md`（README/AGENTS 待写）。旧文档全部作废。

## 一、决策日志

### 2026-08-14

- D1 理念：质量与可复现优先；规模与成本经济。
- D2 场景：用户交书给 agent，agent 在约束下决策翻译，全程在对话框内完成。
- D3 交付：只出设计文档，暂不实现。
- D4 流程八步：确认要求 → 提取预读 → 风格+术语 → 分块 → 子代理逐章翻译 → 对齐组装 → 全书审查 → 反思修订 → 出成品。
- D5 第 0 步：agent 主动发问题卡（体裁/输出格式/术语模式/反思开关/各过程模型）。
- D6 停点三处：确认要求、人工术语、审查结果过目。
- D7 子代理：一章一个，风格+术语随任务注入。
- D8 审查：全书译完统一审。
- D9 反思：只修具体问题，不按章重跑；开关每本书问。
- D10 输出格式：第 0 步由用户选。
- D11 横切：只要断点续跑，不要成本闸。
- D12 引擎：DSH 原生实现，无 Python 依赖。
- D13 模型：每个过程由用户自选。
- D14 术语自动模式：直接采用，有分歧才问。
- D15 拓扑：独立仓库起步、按"可无损并入 monorepo"的标准写；包链入本机部署；不碰在跑的 DSH checkout。
- D16 门槛：全量对标 harness gate + 专属闸（挂载验证、决策日志、证据链冒烟、lefthook）。
- D17 命名：`@deepseek-ai/dsh-itranslation-*`。
- D18 证据闸降级：由"每次提交必过"降为里程碑验收项（每个里程碑跑一次全流程短书冒烟并产出 meta.json 存档）；日常提交仅需单元测试。
- D19 审查标准：不在设计期定稿；作为小任务交子代理调研（参考书籍编译/出版行业），提案经用户确认后回填 DESIGN §4。
- D20 审查报告不分级：只列问题清单（定位到句），修不修由用户停点③决定。
- D21 格式策略：删除格式型里程碑；输入格式用户自选；流程统一转 Markdown 处理、原格式保留存档；输出按用户选择。
- D22 分块：分块方式与参数重开设计，不沿用原项目参数，不定稿不进入实现。

## 二、开发规范（严格模式）

### 2.1 总则

1. 本规范适用于仓库内一切代码、组合文件与文档改动；与 DSH 官方生态规则冲突时，以 DSH 官方规则为准。
2. 红线零例外：任何提交不得绕过红线；确需例外，先追加决策条目、后修改规范，再动代码。
3. 仓库文档有且仅有四份，规范只写在本文档，不新增第五份。

### 2.2 仓库与工具链（对齐 harness）

- pnpm workspace；Node `^22.19 || >=24`。
- 包布局：`packages/itranslation/{core,tools,client}`，命名 `@deepseek-ai/dsh-itranslation-*`（D17），与 harness 的 `packages/<group>/<pkg>/` 约定一致。
- 构建：tsc 出 lib/types + tsdown 打包，host/client 两面（对齐 harness 的 `tsconfig.host/client` 与 `DSH_BUILD_FACE`）。
- 检查栈：typecheck、oxlint、vitest（CI 覆盖率闸 = `packages/*/*/src` **逐文件 100%**）、hygiene（knip + publint + workspace 约束）、duplication（jscpd）。
- 提交钩子 lefthook：pre-commit 增量 lint+typecheck；commit-msg conventional commits；pre-push 测试与覆盖率。
- 密钥纪律：密钥永不入库；运行时走 DSH credentials/env；`.env` 永不提交。
- cordis.yml 中仅 `config` 与 `disabled` 允许 `!!js`（严禁 `!js`），其余字段保持字面量。

### 2.3 组合（cordis.yml）规范

- preset 目标目录：`~/.dsh/.agent-presets/itranslation/`，含 `agent.cordis.yml` + `preset.yml`（name/description）。
- 基线来源：以 shipped preset 的**副本**起步修改；严禁改动部署自带的 shipped preset 目录。
- 行规：每行 `id` + `name`（包名）+ 可选 `config`；包名必须能被本机部署解析（link 或 file: 依赖，D15）。
- 服务行必须置于带 `isolate` realm 的 group 内（`true` = 本 preset 私有实例）；只消费宿主注册表的行不得套 realm。
- 每个 group/行必须写注释说明 plane 归属与 realm 理由（对齐 shipped `standard` 组合的注释风格）。
- 挂载验证：任何 cordis.yml 改动后必须 `standingKeyFor` 通过；roster 的 `broken` 字段不算验证。
- 交付形态：agent preset；动态 Cordis 插件仅允许临时验证，不得作为交付物。

### 2.4 代码红线（DSH 插件生态规则）

- 访问服务用 `ctx.get(name)` + undefined 检查；`inject` 仅用于硬依赖；未声明不得访问 `ctx.xxx`。
- 一切副作用可逆：`ctx.effect` / `ctx.on` / 官方 disposer；停用与更新即清理。
- 注册前必须先 Inspect 查询真实 API（Service/Event/Slot/Builtin），禁止凭名字猜接口。
- Host/Client 只走 Package 私有 JSON RPC，仅传 lossless JSON；禁止序列化或整拷贝 live data（Session、Tool、Slot props 等）。
- Client UI 用 `React.createElement`（动态插件期禁 JSX/TS/import）；UI 注册进查询过的 Slot，不碰 `document.body` 与全局 DOM。
- 动态插件期代码为纯 JS 函数体；正式包为 TS，遵循 harness tsconfig 与包边界。
- 模型调用一律走 DSH `llm` 路由与子代理，禁止自建 API 客户端或硬编码第三方端点。
- 翻译状态与证据链遵守 `DESIGN.md` §5.5 schema；每次翻译运行必产 `meta.json`。

### 2.5 专属质量闸（提交前必过）

1. **挂载闸**：改动 cordis.yml → `standingKeyFor` 通过。
2. **决策闸**：任何设计决策变更 → 本文件「决策日志」追加 D 条目（一行一条），与代码同提交。
3. **证据闸（里程碑级）**：`tools`/`core` 包行为改动以单元测试为准；每个里程碑验收时用样本短书跑通八步冒烟并产出 `meta.json`，存档（路径按 `DESIGN.md` §5.5）。
4. **红线复核**：review 时逐条对照 2.4 与 2.7。

### 2.6 发布与安装回环（D15）

- preset 安装到 `~/.dsh/.agent-presets/itranslation/`；包通过 pnpm link（或 file: 依赖）链入本机部署。
- 版本一致性：包版本号与 preset 记录同步，提供检查脚本，不匹配即报错。
- 迁移预留：目录布局、命名、脚本全部按 harness 约定，将来并入 monorepo 只做物理搬家。

### 2.7 红线清单（零例外）

1. 不改 `~/deepseek-harness` 的任何文件（只读参考）；并入 monorepo 须单独决策（D15）。
2. 不改部署 shipped preset；需改动复制副本。
3. 无 Python 依赖、不建 subprocess 桥（D12）。
4. 不绕过 `DESIGN.md` §6 四类约束。
5. 每次翻译运行必产 `meta.json` 证据链。
6. 不做成本闸（D11）。
7. 不新增第五份仓库文档。

## 三、文档约定

- 四份文档、置于主目录、有且仅有。
- 新设计结论进 `DESIGN.md`；新决策进本文件「决策日志」，D 序号递增。
- README.md 与 AGENTS.md 待写，时机由用户决定。
