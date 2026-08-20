<p align="center">
  <img src="https://img.shields.io/badge/agent%20preset-Itranslation-536DFE" alt="Preset">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/version-0.1.0-536DFE" alt="Version">
  <img src="https://img.shields.io/badge/platform-DeepSeek%20Harness-lightgrey" alt="Platform">
</p>

<h1 align="center">Itranslation × DSH</h1>
<p align="center"><strong>整本书翻译生产线 · DeepSeek Harness Agent Preset</strong></p>
<p align="center">
  Markdown → 全本中文译文<br>
  确定性章节识别 · 空行分段 · 子代理逐章翻译 · 软对齐组装 · 全书审查 · 定向修订 · meta.json 证据链
</p>

> 开发接近尾声：确定性引擎、六个工具、client UI 与部署链入均已落地并通过全量检查闸（类型检查 / lint / 逐文件 100% 覆盖率 / knip / publint / jscpd）。唯一待办：用样本短书跑通九步端到端冒烟并产出 `meta.json`（当场人工验收）。

---

## 概览

Itranslation × DSH 是一个整本书翻译生产线的 DeepSeek Harness agent preset：把一本书交给 agent，得到全本中文译文与完整证据链。书籍建议先经 E2M 统一转成 Markdown，经九步流程自动处理——确定性引擎负责章节识别、分段与组装（纯代码、不经过 LLM），子代理负责逐章翻译（独立上下文、不占主上下文），独立审查模型按段对照原文备份定位问题，只修问题段——最终输出规范格式的 Markdown 成品与可审计的 `meta.json` 证据链。

同一本书、同一配置可复现重跑；每次运行落盘 `meta.json`、审查报告、术语表与状态文件，留存可审计。

## 差异化

| 能力 | 典型做法 | Itranslation × DSH |
|---|---|---|
| 翻译工作单元 | 整章一次性翻译 | 空行分段为工作单元；子代理逐段翻译、句序对齐原文，句数失配仅告警（软对齐） |
| 上下文管理 | 全部塞进主会话 | 一章一个 `spawn` 子代理（独立上下文、模型固定），主上下文不随书长膨胀 |
| 术语一致性 | LLM 记忆 / 事后纠错 | 预读子代理产出 `glossary.json` → 人工确认锁定 → 审查维度之一，修订回写留痕 |
| 质量保障 | 一遍过 | 独立审查模型按「章/段」对照原文备份定位问题（5 维度），只重译问题段 |
| 中断恢复 | 自建断点续跑 | DSH 会话记录即断点：中断后回原会话继续，零自建持久化 |
| 可复现性 | 黑盒 | 确定性边界（提取/章节/分段/组装纯代码）+ `meta.json` 证据链，同书同配置可重跑 |
| 成本可见性 | 账单出来才知道 | 已完成章不重复付费；token/耗时/过程记录写入 `meta.json` |

## 安装（链入本机 DSH）

前置：Node `^22.19 || >=24`、pnpm 11.7（仓库声明于 `packageManager`）、本机 DSH 部署（`dsh web`）。

```bash
git clone <repo> && cd dsh-itranslation
pnpm install                          # 依赖 + 自动装 git 钩子
pnpm run build                        # 双面构建（tsc + tsdown，含 client 浏览器 bundle）

node scripts/install-web-deploy.mjs        # dry-run：预览会写入 ~/.dsh/profiles/web/ 的改动
node scripts/install-web-deploy.mjs --apply  # 幂等落盘：file: 依赖 + cordis.patch.yml insert
cd ~/.dsh/profiles/web && pnpm install && dsh web   # 重启生效
```

部署脚本只改用户 profile（`~/.dsh/profiles/web/`），不碰 `~/deepseek-harness`。重启后在 DSH 新建会话，选择 **Itranslation** preset 即可。

## 使用

把 E2M 转出的 Markdown 放进会话工作区的 `input/`，将书交给 agent。你在**三处停点**回应，其余（预读、分章翻译、组装、审查）全自动：

| 停点 | 时机 | 你要做的 |
|---|---|---|
| ① 目标语言 | 动手翻译前 | 只回答一个问题：目标语言。体裁、风格、术语模式全自动，不会多问 |
| ② 术语表 | 预读完成、`glossary.json` 生成后 | 可直接编辑该文件增删术语，确认后 agent 才开始翻译 |
| ③ 审查报告 | 全书译完、报告出来后 | 过目 `audit-report.md`：进入修订（只改报告指出的问题段），或直接出成品 |

工作流与产物：

```
input/<书>.md                              output/<slug>.md
    │  prepare（录入，## 章边界）                 ▲  assemble（组装 + meta.json）
    ▼                                          │
books/<slug>/                                 │
    ├─ state.json         章结构                │
    ├─ source/<n>.md      清理后原文备份（审查依据）
    ├─ chapters/<n>.md    各章译文（子代理逐章落盘；超长章分片 <n>.<k>.md）
    ├─ glossary.json      术语表（停点②可编辑）
    ├─ style.md           统一风格说明
    ├─ audit-report.md    全书审查报告（停点③过目）
    └─ meta.json          证据链（模型/耗时/token/修订记录）
```

## 配置

### preset 配置（`presets/itranslation/agent.cordis.yml`）

| 键 | 默认 | 说明 |
|---|---|---|
| `overlongThresholdBytes` | `40000` | 章节源文本超过该字节数时被 `itranslation_segment` 标记为超长，agent 停下告知、不自动分片 |

### LLM 提示词（设置页，命名空间 `itranslation`）

四个 LLM 步骤（预读/翻译/审查/修订）的附加提示词模板，在 DSH 设置页「整书翻译」分区编辑（经插件自有路由 `/_dsh/itranslation/settings` 读写），留空表示不附加额外提示词：

| 键 | 默认 | 说明 |
|---|---|---|
| `preReadPrompt` | 空串 | 预读子代理附加提示词 |
| `translatePrompt` | 空串 | 翻译子代理附加提示词 |
| `auditPrompt` | 空串 | 审查模型附加提示词 |
| `revisePrompt` | 空串 | 修订模型附加提示词 |

## 功能特性

### 确定性引擎（core，零 DSH 依赖）

章节识别只认 `##` 为章边界（书名 `#`、节 `###` 留在正文，标题属性 `{#...}` 剥除，第一个 `##` 之前的正文为独立空标题章，无 `##` 整本作单章）；段落由 Markdown 空行天然承载；组装按原文/译文空行分段比对段数，章/段数失配抛错由工具层询问，绝不静默继续。slug 由书名确定性生成（NFKC 规范化、保留中文、规避 Windows 保留名、≤200 字符）。

### 六个确定性工具（tools）

| 工具 | 作用 | 关键参数 | 主要输出 |
|---|---|---|---|
| `itranslation_prepare` | 一本书录入：读 `input/` 下 Markdown → 识别 `##` 章边界 → 落原文备份与章结构；已准备过的书拒绝覆盖 | `path`（必填）、`title` | `slug`、`chapters`、`sourceFiles` |
| `itranslation_segment` | 分段报告（只读）：每章段数/句数/字节，标记超长章 | `slug`、`chapter`（可选） | `chapters[]`、`overlongChapters[]` |
| `itranslation_glossary` | 术语表管理：按 term 增补（set）/删除（remove）并回写；不带参数时只读 | `slug`、`set[]`、`remove[]`、`source` | `entries[]` |
| `itranslation_align` | 组装校验：读原文与译文（含分片）→ 空行比对段数并组装 → 写 `aligned.md` 预览 | `slug` | `ok`、`chapters[]`、`mismatch` |
| `itranslation_assemble` | 出成品 + 证据链：前置 `state.json`/`chapters/`/`audit-report.md` 齐全才执行 → 写 `output/<slug>.md` 与 `meta.json` | `slug`、`processes[]`（LLM 过程记录） | `ok`、`outputFile`、`metaFile` |
| `itranslation_status` | 进度与证据摘要（只读）：产物存在性、已译章数、工作阶段 | `slug` | `artifacts{}`、`phase` |

所有工具执行前校验前置产物与步骤顺序，不齐即拒绝（硬拦只在确定性工具处）；失配等数据条件返回结构化 `ok:false` 由 agent 转问用户。

### 子代理并行翻译

一章一个 `spawn` 子代理（独立上下文、模型固定）；任务只注入该章文本，风格说明与术语表由子代理直读书级目录文件（单一真相源，不占注入预算）；超长章由主 agent 拆分并留痕，分片各派一个子代理。并发/分批由主 agent 自定。

### 全书审查与定向修订

全书译完统一审查（不逐章审）：独立审查模型按「章/段」对照原文备份定位问题，产出 `audit-report.md`（5 维度：忠实度与准确性、术语与专名一致性、通顺与可读性、格式标点数字、体例与信息完整性；不分级、只列问题清单）。报告交用户过目（停点③），修订只重译问题段、不按章重跑；术语改动回写 `glossary.json` 并留痕。

### Client UI

Run 卡进度：六个 `itranslation_*` 工具各一行状态行（运行中/完成/失配/失败），从冻结的 call/result 派生中文摘要；提示词设置页：四个 LLM 提示词文本框。视觉对齐 harness 设计语言（共享 primitives + CSS Module + `--dsw-alias-*` token）。

## 架构

```
                    ┌─────────────────────────────────────────────┐
                    │               DSH 运行时（宿主）              │
                    │   llm 路由 · subagents · settings · fs · web  │
                    └───────┬──────────────┬──────────────┬────────┘
                            │              │              │
              ┌─────────────▼──────┐  ┌────▼─────┐  ┌─────▼──────────┐
              │  tools（Host 工具面）│  │  client  │  │ agent（主/子）  │
              │  六确定性工具 +     │  │ UI（Run卡 │  │ 预读/翻译/审查/ │
              │  书级状态文件       │  │ +设置页）  │  │ 修订（LLM 层）  │
              └─────────────┬──────┘  └──────────┘  └────────────────┘
                            │ 依赖
              ┌─────────────▼──────┐
              │  core（确定性引擎）  │  slugify / detectChapters /
              │  零 DSH 依赖        │  segmentParagraphs / assembleBook
              └────────────────────┘
```

LLM 层由 agent 直接调 DSH `llm` 服务与 `subagent` 工具完成，插件工具只负责确定性文本层与书级状态文件——无 Python 依赖、不自建 API 客户端。

## 项目结构

```
dsh-itranslation/
├── packages/itranslation/
│   ├── core/      确定性文本引擎（章节识别/分段/组装），零 DSH 依赖
│   ├── tools/     Host 工具面：六个 itranslation_* 工具与书级状态文件管理
│   └── client/    Client UI：Run 卡进度、提示词设置页（host/client 双面构建）
├── presets/itranslation/   agent preset 组合（agent.cordis.yml + preset.yml）
├── scripts/       lefthook 安装、commit-msg 校验、web 部署链入（幂等）
├── input/         用户放入 E2M 转出的 Markdown
├── books/         书级工作目录（<slug>/，会话期间产物）
├── output/        最终成品（<slug>.md）
└── DESIGN.md / DEVELOPMENT.md / AGENTS.md / README.md   仓库文档（有且仅有四份）
```

## 开发

检查闸（提交前必过）：`typecheck`（host + client 双聚合）→ `lint`（oxlint）→ `test:coverage`（逐文件 100% 覆盖率）→ `hygiene`（knip + publint）→ `duplication`（jscpd）。lefthook 在 pre-commit 跑增量 lint + 全量 typecheck，commit-msg 校验 conventional commits，pre-push 跑测试与覆盖率。

规范与决策：设计唯一依据 [DESIGN.md](./DESIGN.md)，开发规范与决策日志 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## License

MIT
