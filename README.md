# Itranslation × DSH

整本书翻译生产线，交付形态为 DeepSeek Harness（DSH）agent preset。

**把一本书交给 agent，拿回全本译文与完整证据链。**同一本书、同一配置可以复现重跑；每次运行落盘 `meta.json`、审查报告、术语表与状态文件，留存可审计（DESIGN.md §1）。

## 怎么用

1. **备书**：书先用 E2M 统一转成 Markdown（`~/e2m-venv`），放到会话工作区的 `input/` 下。
2. **交书**：新建会话，选择 **Itranslation** preset，把书交给 agent。
3. **回应三处停点**——其余（预读、分章翻译、组装、审查）全自动：

| 停点 | 时机 | 你要做的 |
|---|---|---|
| ① 目标语言 | 动手翻译前 | 只回答一个问题：目标语言。体裁、风格、术语模式全自动，不会多问 |
| ② 术语表 | 预读完成、`glossary.json` 生成后 | 可以直接编辑该文件增删术语，确认后 agent 才开始翻译 |
| ③ 审查报告 | 全书译完、报告出来后 | 过目 `audit-report.md`：进入修订（只改报告指出的问题段），或直接出成品 |

4. **拿成品**：最终译文在 `output/<slug>.md`（slug 由书名生成）；证据链留在 `books/<slug>/`。

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

流程共九步：确认语言 → 提取预读 → 术语确认 → 分段 → 逐章翻译 → 对齐组装 → 全书审查 → 反思修订 → 出成品（DESIGN.md §3）。确定性步骤（录入/分段/组装）由插件工具完成，章/段数失配会停下询问而不是静默继续；LLM 只出现在预读、翻译、审查、修订四处。

## 仓库布局

```
packages/itranslation/
  core/     确定性文本引擎（章节识别/分段/组装），零 DSH 依赖
  tools/    Host 工具面：六个 itranslation_* 工具与书级状态文件
  client/   Client UI：Run 卡进度、提示词设置页（host/client 双面构建）
presets/itranslation/   agent preset 组合（agent.cordis.yml + preset.yml）
scripts/                安装与部署脚本
```

## 开发者：快速开始

要求：Node `^22.19 || >=24`，pnpm 11.7（仓库声明于 `packageManager`）。

```bash
pnpm install            # 依赖 + 自动装 git 钩子
pnpm run build          # 双面构建（tsc + tsdown）
pnpm run typecheck      # host + client 全量类型检查
pnpm run lint           # oxlint
pnpm run test:coverage  # 单测 + 逐文件 100% 覆盖率闸（提交前必过）
pnpm run hygiene        # knip + publint
pnpm run duplication    # jscpd 重复代码
```

> 沙箱备注：`.npmrc` 把 pnpm store 指向仓库内 `.pnpm-store/`，使安装在工作区写沙箱下也可复现。

### 链入本机 DSH 部署

```bash
pnpm run build                          # 先构建（含 client 浏览器 bundle）
node scripts/install-web-deploy.mjs     # dry-run 预览
node scripts/install-web-deploy.mjs --apply  # 幂等落盘：file: 依赖 + cordis.patch.yml insert
cd ~/.dsh/profiles/web && pnpm install && dsh web   # 重启生效
```

只改用户 profile（`~/.dsh/profiles/web/`），不碰 `~/deepseek-harness`。

## 现状与路线

- ✅ 已落地：确定性引擎、六个工具、client UI（Run 卡 + 提示词设置页）、preset 组合、web 部署链入
- ☐ 待办：端到端冒烟验收——样本短书跑通九步并产出 `meta.json`（当场人工验收）

规范与决策：设计唯一依据 [DESIGN.md](./DESIGN.md)，开发规范与决策日志 [DEVELOPMENT.md](./DEVELOPMENT.md)。仓库文档有且仅有四份：README / AGENTS / DESIGN / DEVELOPMENT，不新增第五份。
