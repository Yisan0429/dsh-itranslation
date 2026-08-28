<p align="center">
  <img src="https://img.shields.io/badge/agent%20preset-Itranslation-536DFE" alt="Preset">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/version-1.0.2-536DFE" alt="Version">
  <img src="https://img.shields.io/badge/platform-DeepSeek%20Harness-lightgrey" alt="Platform">
</p>

<h1 align="center">Itranslation × DSH</h1>
<p align="center"><strong>整本书翻译生产线 · DeepSeek Harness Agent Preset</strong></p>
<p align="center">
  Markdown → 全本译文（默认简体中文）<br>
  确定性章节识别 · 空行分段 · 子代理逐章翻译 · 软对齐组装 · 全书审查 · 定向修订 · meta.json 证据链
</p>

> 当前状态：确定性引擎、十个工具、client UI 与部署链入均已落地，并通过全量检查闸（类型检查 / lint / 逐文件 100% 覆盖率 / knip / publint / jscpd）。可直接链入本机 DSH 使用。

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

### 方式一：从源码仓库链入（当前推荐）

```bash
git clone <repo> && cd dsh-itranslation
pnpm install                          # 依赖 + 自动装 git 钩子
pnpm run build                        # 双面构建（tsc + tsdown，含 client 浏览器 bundle）

node scripts/install-web-deploy.mjs        # dry-run：预览会写入 ~/.dsh/profiles/web/ 的改动
node scripts/install-web-deploy.mjs --apply  # 幂等落盘：打包 tarball、执行 dsh plugin add、同步 agent preset
dsh web                                   # 重启生效
```

`install-web-deploy.mjs --apply` 现在走的是 DSH 官方插件通道：它把
`packages/itranslation/bundle`（`@yisan0429/dsh-itranslation`）连同
core/tools/client 打成 tarball，然后用 `dsh plugin --profile web add file:<bundle>.tgz`
安装。DSH 会自动把该 bundle 加入 `dsh.profile.bundles` 并加载其
`cordis.patch.yml`（插入 client host entry）。脚本随后还会自动同步
agent preset 到 `~/.dsh/.agent-presets/itranslation/`。

### 方式二：已发布到 npm 后

```bash
dsh plugin --profile web add @yisan0429/dsh-itranslation
```

安装后仍需同步 agent preset：

```bash
node scripts/sync-agent-preset.mjs --apply
dsh web
```

修改 preset（`presets/itranslation/agent.cordis.yml`）后：重跑 `sync-agent-preset.mjs --apply` 并重启 `dsh web`——repo 是唯一真相源，部署副本由脚本同步，不存在两份文件漂移的问题。

部署脚本只改用户 profile（`~/.dsh/profiles/web/`），不碰 `~/deepseek-harness`。重启后在 DSH 新建会话，选择 **Itranslation** preset 即可。

## 使用

输入文件与目标语言在设置页配置，开启新对话，选用 Itranslation 模式后发送“开始翻译”。你在**两处停点**回应，其余（预读、分章翻译、组装、审查）全自动：

| 停点 | 时机 | 你要做的 |
|---|---|---|
| ① 术语表 | 预读完成、`glossary.json` 生成后 | 可直接编辑该文件增删术语，确认后 agent 才开始翻译 |
| ② 审查报告 | 全书译完、报告出来后 | 过目 `audit-report.md`：进入修订（只改报告指出的问题段），或直接出成品 |

**失败与中断**：任何步骤的工具调用报错（如 `prepare` 拒绝已录入的书）、派发被取消、或你打断/纠正 agent 时，agent 立即停止：只原样报告该步错误（若有），不做任何自行处置（不重试、不换路径、不继续下一步、不提问、不宣告下一步），等待你的明确指示。两个停点是 agent 仅有的两次提问；其余任何情况（含出错、被取消、被打断后）它都不提问、不决策。

工作流与产物：

```
input/<书>.md                              output/<slug>.md
    │  prepare（录入，## 章边界）                 ▲  assemble（组装 + meta.json）
    ▼                                          │
produce/<slug>/                               │
    ├─ state.json         章结构                │
    ├─ source/<n>.md      清理后原文备份（审查依据）
    ├─ chapters/<n>.md    各章译文（子代理逐章落盘；超长章分片 <n>.<k>.md）
    ├─ glossary.json      术语表（停点①可编辑）
    ├─ analysis.md        书档案（背景/摘要/逻辑线 + 完整风格指南）
    ├─ audit-report.md    全书审查报告（停点②过目）
    └─ meta.json          证据链（模型/耗时/token/修订记录）
```

## 配置

### preset 配置（`presets/itranslation/agent.cordis.yml`）

| 键 | 默认 | 说明 |
|---|---|---|
| `overlongThresholdBytes` | `40000` | 章节源文本超过该字节数时被 `itranslation_segment` 标记为超长，agent 停下告知、不自动分片 |

### LLM 提示词（设置页，命名空间 `itranslation`）

四个 LLM 步骤（预读/翻译/审查/修订）的附加提示词模板，在 DSH 设置页「整书翻译」分区编辑（经插件自有路由 `/_dsh/itranslation/settings` 读写）。**默认值为内置成品提示词**（core 包 `DEFAULT_PROMPTS`，设置页与 `itranslation_prompts` 工具共用同一真相源）；`itranslation_dispatch` 派发子代理时自动读取对应提示词并组装任务文本，留空/清空即回退到内置默认。`itranslation_prompts` 仅作只读查看/调试用，主代理在流水线中不应调用。同一设置页还包含 `targetLanguage`（默认 `简体中文`）与 `inputFile`（留空自动发现 `input/` 下唯一 .md）。四个提示词键如下：

| 键 | 默认 | 说明 |
|---|---|---|
| `preReadPrompt` | 内置预读提示词 | 预读子代理附加提示词（通读全书 → 直接落盘 `analysis.md`（含完整风格指南）+ 高价值 `glossary.json`） |
| `translatePrompt` | 内置翻译提示词 | 翻译子代理附加提示词（查表术语、段落数一致、不含章标题） |
| `auditPrompt` | 内置审查提示词 | 审查模型附加提示词（5 维度、按章/段定位、不分级） |
| `revisePrompt` | 内置修订提示词 | 修订模型附加提示词（只改报告指出的问题段） |

## 功能特性

### 确定性引擎（core，零 DSH 依赖）

章节识别只认 `##` 为章边界（书名 `#`、节 `###` 留在正文，标题属性 `{#...}` 剥除，第一个 `##` 之前的正文为独立空标题章，无 `##` 整本作单章）；段落由 Markdown 空行天然承载；组装按原文/译文空行分段比对段数，章/段数失配抛错由工具层询问，绝不静默继续。slug 由书名确定性生成（NFKC 规范化、保留中文、规避 Windows 保留名、≤200 字符）。

**标题翻译（程序级）**：组装时书名行与 `##` 章标题自动经 `glossary.json` 译成目标语言（`## The First Storm` → `## 第一场风暴`；glossary 无对应条目时保留原文）。空标题首章正文若以 `# <书名>` 行开头（E2M 标题行落入正文的产物），组装会丢弃该段及其译文，确保书名行只出现一次。

### 十个确定性工具（tools）

| 工具 | 作用 | 关键参数 | 主要输出 |
|---|---|---|---|
| `itranslation_prepare` | 一本书录入：读 `input/` 下 Markdown → 识别 `##` 章边界 → 落原文备份与章结构；已准备过的书拒绝覆盖 | `path`、`title` | `slug`、`chapters`、`sourceFiles` |
| `itranslation_segment` | 分段报告（只读）：每章段数/句数/字节，标记超长章 | `slug`、`chapter`（可选） | `chapters[]`、`overlongChapters[]` |
| `itranslation_glossary` | 术语表管理：按 term 增补（set）/删除（remove）并回写；不带参数时只读 | `slug`、`set[]`、`remove[]`、`source` | `entries[]` |
| `itranslation_scoped_read` | 子代理专用受限读取：只读本步骤派发时白名单内的文件，白名单外一律拒绝 | `file_path` | `ok`、`path`、`content` |
| `itranslation_scoped_write` | 子代理专用受限写入：只写本步骤派发时白名单内的文件，白名单外一律拒绝 | `file_path`、`content` | `ok`、`path` |
| `itranslation_dispatch` | 确定性派发流水线子代理：按步骤组装任务文本并后台启动/续发子代理（pre-read/translate/audit/revise）；revise 复用审计子代理会话 | `slug`、`step`、`language`、`chapter`、`childId` | `ok`、`step`、`subagentId`/`messageId` |
| `itranslation_align` | 组装校验：读原文与译文（含分片）→ 空行比对段数并组装 → 写 `aligned.md` 预览（标题经 glossary 翻译） | `slug` | `ok`、`chapters[]`、`mismatch` |
| `itranslation_assemble` | 出成品 + 证据链：前置 `state.json`/`chapters/`/`audit-report.md` 齐全才执行 → 写 `output/<slug>.md`（标题经 glossary 翻译）与 `meta.json`（processes 从会话日志自动导出：模型/起止/用量；`processes[]` 参数只作补充 notes） | `slug`、`processes[]`（可选 notes） | `ok`、`outputFile`、`metaFile` |
| `itranslation_status` | 进度与证据摘要（只读）：产物存在性、已译章数、工作阶段 | `slug` | `artifacts{}`、`phase` |
| `itranslation_prompts` | 读取四个 LLM 步骤的附加提示词（只读）：设置页已保存值优先，未设置返回内置默认 | 无 | `ok`、`source`、`prompts{}` |

主流程工具执行前会校验前置产物与步骤顺序，不齐即拒绝（硬拦只在确定性工具处）；失配等数据条件返回结构化 `ok:false` 由 agent 转问用户。

### 子代理并行翻译

一章一个 `spawn` 子代理（独立上下文、模型固定），由 `itranslation_dispatch` 统一组装任务并后台启动；任务只注入固定提示词与路径，章节正文、风格说明与术语表由子代理经 `itranslation_scoped_read` 直读书级目录文件（单一真相源，不占注入预算）；超长章由主 agent 拆分并留痕，分片各派一个子代理。并发/分批由主 agent 自定。

### 术语表范围约束

`glossary.json` 的收录是**主动识别关键术语**，而非穷举名词：必收书名与各章章名（组装阶段据此生成中文标题，term 须与原文标题完全一致、区分大小写）、专名（人名/地名/机构名，音译即取舍）、不常见或领域词、有争议或歧义译法、抽象概念词；不得用只有唯一自然译法的普通名词凑数。**硬上限 200 条**——`itranslation_glossary` 超过即拒绝写入；单次批量新增超过 100 条返回软警告（不拦截）。约束落在 preset persona（预读指令）与工具护栏中，停点①的人工审阅仍可增删。

### 全书审查与定向修订

全书译完统一审查（不逐章审）：独立审查模型按「章/段」对照原文备份定位问题，产出 `audit-report.md`（5 维度：忠实度与准确性、术语与专名一致性、通顺与可读性、格式标点数字、体例与信息完整性；不分级、只列问题清单）。报告交用户过目（停点②），修订只重译问题段、不按章重跑；术语改动回写 `glossary.json` 并留痕。

### Client UI

Run 卡进度：六个主流程 `itranslation_*` 工具各一行状态行（运行中/完成/失配/失败），从冻结的 call/result 派生中文摘要；提示词设置页：四个 LLM 提示词文本框，外加目标语言与输入文件配置。视觉对齐 harness 设计语言（共享 primitives + CSS Module + `--dsw-alias-*` token）。

## 架构

```
                    ┌─────────────────────────────────────────────┐
                    │               DSH 运行时（宿主）              │
                    │   llm 路由 · subagents · settings · fs · web  │
                    └───────┬──────────────┬──────────────┬────────┘
                            │              │              │
              ┌─────────────▼──────┐  ┌────▼─────┐  ┌─────▼──────────┐
              │  tools（Host 工具面）│  │  client  │  │ agent（主/子）  │
              │  十个确定性工具 +   │  │ UI（Run卡 │  │ 预读/翻译/审查/ │
              │  书级状态文件       │  │ +设置页）  │  │ 修订（LLM 层）  │
              └─────────────┬──────┘  └──────────┘  └────────────────┘
                            │ 依赖
              ┌─────────────▼──────┐
              │  core（确定性引擎）  │  slugify / detectChapters /
              │  零 DSH 依赖        │  segmentParagraphs / assembleBook
              └────────────────────┘
```

LLM 层由 `itranslation_dispatch` 经 DSH `subagents` 服务派发子代理完成；插件工具负责确定性文本层、子代理文件围栏与书级状态文件——无 Python 依赖、不自建 API 客户端。

## 项目结构

```
dsh-itranslation/
├── packages/itranslation/
│   ├── core/      确定性文本引擎（章节识别/分段/组装），零 DSH 依赖
│   ├── tools/     Host 工具面：十个 itranslation_* 工具（主流程、派发、子代理受限读写）与书级状态文件管理
│   ├── client/    Client UI：Run 卡进度、提示词/目标语言/输入文件设置页（host/client 双面构建）
│   └── bundle/    DSH bundle 入口：`dsh.bundle.patch` + `cordis.patch.yml`，供 `dsh plugin add` 安装
├── presets/itranslation/   agent preset 组合（agent.cordis.yml + preset.yml）
├── scripts/       lefthook 安装、commit-msg 校验、web 部署链入（幂等，内部走 dsh plugin add）
├── input/         用户放入 E2M 转出的 Markdown
├── produce/       书级工作目录（<slug>/，会话期间产物）
├── output/        最终成品（<slug>.md）
└── README.md   产品与使用文档（历史设计与决策记录见 archive/，不随发布分发）
```

## 开发

检查闸（提交前必过）：`typecheck`（host + client 双聚合）→ `lint`（oxlint）→ `test:coverage`（逐文件 100% 覆盖率）→ `hygiene`（knip + publint）→ `duplication`（jscpd）。lefthook 在 pre-commit 跑增量 lint + 全量 typecheck，commit-msg 校验 conventional commits，pre-push 跑测试与覆盖率。

设计/开发决策历史记录已归档至 `archive/`（本地保留，不随发布分发）。

## License

MIT
