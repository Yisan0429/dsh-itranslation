# Itranslation × DSH

整本书翻译生产线，交付形态为 DeepSeek Harness（DSH）agent preset。

核心理念只有两条（见 [DESIGN.md](./DESIGN.md) §1）：

1. **质量与可复现优先** — 同一本书、同一配置，流程可复现；每次运行留下完整证据链（`meta.json`、审查报告、术语表、状态文件），留存可审计。
2. **规模与成本经济** — 章节并行、子代理逐章翻译；已完成工作不重复付费（DSH 会话记录承接）；反思修订在审查后询问、按需开启。

**当前状态**：开发已接近尾声——确定性引擎、六个工具、client UI、preset 组合与部署链入全部落地（D50–D70）。唯一未闭合的里程碑是 D39：用样本短书跑通九步端到端冒烟并产出 `meta.json`（当场人工验收，不存档）。

## 仓库文档（有且仅有四份，均置于主目录）

| 文档 | 内容 |
|---|---|
| [DESIGN.md](./DESIGN.md) | 设计唯一依据：九步流程、审查标准、架构、约束 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 开发规范（严格模式）与决策日志；一切决策可追溯至此 |
| [AGENTS.md](./AGENTS.md) | 面向在仓库内工作的 agent 的守则与命令 |
| [README.md](./README.md) | 本文件：项目概览与快速开始 |

不新增第五份文档；新设计结论进 DESIGN.md，新决策进 DEVELOPMENT.md 决策日志（D 序号递增）。

## 仓库布局

```
packages/itranslation/
  core/     @deepseek-ai/dsh-itranslation-core    确定性文本引擎（提取/章节/分段/组装），零 DSH 依赖
  tools/    @deepseek-ai/dsh-itranslation-tools   Host 工具面 + 书级状态文件管理（六个 itranslation_* 工具）
  client/   @deepseek-ai/dsh-itranslation-client  Client UI（Run 卡进度、提示词设置页），host/client 双面构建
presets/itranslation/  agent preset 组合（agent.cordis.yml + preset.yml，D60）
scripts/               lefthook 安装、commit-msg 校验、web 部署链入脚本
```

目录布局、命名与构建方式按 harness 约定书写，为将来"可无损并入 monorepo"预留（D15）。

## 工作目录约定（D70）

翻译工作在会话 workspace 下的三个固定目录之间流转（详见 DESIGN.md §5.5）：

```
<会话 workspace>/
  input/              用户放入 E2M 转出的 Markdown（prepare 的 path 传 input/<文件>.md）
  books/<slug>/       书级工作目录：state.json、source/<n>.md、chapters/<n>.md、
                      glossary.json、style.md、aligned.md、audit-report.md、meta.json
  output/<slug>.md    最终成品（assemble 写入，books/ 中不含成品）
```

`slug = slugify(书名)`（D42）；书级目录对主 agent 与各翻译子代理同根可读写（D47）。

## 九步流程速览（DESIGN.md §3）

第 0 步确认 + 第 1–8 步：

| 步骤 | 内容 | 停点 |
|---|---|---|
| 0. 确认目标语言 | 问题卡只问目标语言，其余（体裁/风格/术语模式）全自动 | ① |
| 1. 提取并预读 | 确定性章节识别与分段校验；预读子代理读全书，直接落盘 `style.md` 与 `glossary.json`（D65） | |
| 2. 确认关键术语 | 用户可自行编辑 `glossary.json` 增删术语，确认后继续 | ② |
| 3. 章节结构与分段 | `##` 章边界（D56）、空行分段；超长章停下告知，不自动分片（D57） | |
| 4. 子代理逐章翻译 | 一章一个 `spawn` 子代理（独立上下文），译文落盘 `chapters/<n>.md`（超长章分片 `<n>.<k>.md`） | |
| 5. 章节对齐组装 | 按原文/译文空行分段比对段数；失配返回结构化 `ok:false` 由工具层询问（D56） | |
| 6. 全书审查 | 独立审查模型按段对照原文备份，产出 `audit-report.md` 交用户过目 | ③ |
| 7. 反思修订 | 只重译审查报告定位的问题段，修订后复审 | |
| 8. 出成品 | `output/<slug>.md` + `meta.json` 证据链（`processes` 记录各 LLM 过程） | |

确定性步骤（提取、章节识别、分段、组装）必须走插件工具；LLM 只出现在预读、翻译、审查、修订四处，由 agent 直接调 DSH `llm` 服务与子代理完成（D26）。

## 快速开始

要求：Node `^22.19 || >=24`，pnpm 11.7（仓库声明于 `packageManager`）。

```bash
pnpm install          # 安装依赖并自动装好 git 钩子(postinstall)
pnpm run build        # tsc 双面类型产出 + tsdown host/client 双面打包
pnpm run typecheck    # host + client 两个聚合程序全量类型检查
pnpm run lint         # oxlint（对齐 harness 规则子集）
pnpm run test         # vitest 单测
pnpm run test:coverage  # 逐文件 100% 覆盖率闸（提交前必过）
pnpm run hygiene      # knip + publint（建议在 build 之后跑）
pnpm run duplication  # jscpd 重复代码检查
```

> 沙箱环境备注：`.npmrc` 将 pnpm 内容 store 指向仓库内 `.pnpm-store/`（已 gitignore），使安装在工作区写沙箱下也可复现；普通环境不受影响。

### 链入本机 DSH 部署

```bash
pnpm run build                        # 先构建三包（含 client 浏览器 bundle）
node scripts/install-web-deploy.mjs   # dry-run：预览会写入 ~/.dsh/profiles/web/ 的改动
node scripts/install-web-deploy.mjs --apply   # 写入 file: 依赖 + cordis.patch.yml insert（幂等）
cd ~/.dsh/profiles/web && pnpm install && dsh web    # 重启 DSH 生效
```

> 部署脚本只改用户 profile（`~/.dsh/profiles/web/`），不碰 `~/deepseek-harness`（红线 1）。

## 开发流程

1. **先读规范**：任何改动前对照 [DEVELOPMENT.md](./DEVELOPMENT.md) 的红线清单（2.7）与代码红线（2.4）。
2. **决策先行**：设计决策变更必须与代码同提交一条 D 条目（决策闸）；红线零例外，确需例外先追加决策、后改规范、再动代码。
3. **提交**：conventional commits（`feat/fix/docs/chore/…`）；lefthook 在 pre-commit 跑增量 lint + 全量 typecheck，commit-msg 校验格式，pre-push 跑测试与覆盖率。
4. **验收**：`tools`/`core` 行为改动以单元测试为准；每个里程碑用样本短书跑通九步冒烟并产出 `meta.json`，当场人工检查（D39）。

## 里程碑路线

- [x] 架构与开发流程：workspace 三包、双面构建、检查栈、钩子、四份文档（D50–D54）
- [x] 确定性引擎：章节识别（`##` 章边界）、分段、组装（D55–D57）
- [x] `tools` 工具面与书级状态文件：六个 `itranslation_*` 工具（D58–D60）
- [x] `client` UI：Run 卡进度、提示词设置页（D61/D66）；设置页经插件自有路由读写（D68/D69）
- [x] preset 安装 + host 工具挂载 + web 部署链入（D60/D63/D64）；input/output 目录接入（D70）
- [ ] 九步流程端到端冒烟 + `meta.json` 证据链（D39，当场人工验收）
