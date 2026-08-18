# Itranslation × DSH

整本书翻译生产线,交付形态为 DeepSeek Harness(DSH)agent preset。

核心理念只有两条(见 [DESIGN.md](./DESIGN.md) §1):

1. **质量与可复现优先** — 同一本书、同一配置,流程可复现;每次运行留下完整证据链(`meta.json`、审查报告、术语表、状态文件),留存可审计。
2. **规模与成本经济** — 章节并行、子代理逐章翻译;已完成工作不重复付费(DSH 会话记录承接);反思修订在审查后询问、按需开启。

**当前状态**:设计定稿,仓库架构与开发流程已建立。确定性文本引擎(`core`)已落地 slug、章节识别(`##` 章边界)、Markdown 空行分段与全书组装(D56/D57);`tools` 六个确定性工具与书级状态文件已落地(D58);`client` UI 已落地 Run 卡进度与设置页(D61)。host 工具侧已可挂载(preset 绝对路径行经 Cordis loader 验证注册 `itranslation.*` 六工具);client 浏览器半边尚待部署端链入模块表(D63)。

## 仓库文档(有且仅有四份,均置于主目录)

| 文档 | 内容 |
|---|---|
| [DESIGN.md](./DESIGN.md) | 设计唯一依据:九步流程、审查标准、架构、约束 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 开发规范(严格模式)与决策日志;一切决策可追溯至此 |
| [AGENTS.md](./AGENTS.md) | 面向在仓库内工作的 agent 的守则与命令 |
| [README.md](./README.md) | 本文件:项目概览与快速开始 |

不新增第五份文档;新设计结论进 DESIGN.md,新决策进 DEVELOPMENT.md 决策日志(D 序号递增)。

## 仓库布局

```
packages/itranslation/
  core/     @deepseek-ai/dsh-itranslation-core   确定性文本引擎(提取/章节/分段/组装),零 DSH 依赖
  tools/    @deepseek-ai/dsh-itranslation-tools  Host 工具面 + 书级状态文件管理
  client/   @deepseek-ai/dsh-itranslation-client Client UI(Run 卡进度、设置页),host/client 双面构建
```

目录布局、命名与构建方式按 harness 约定书写,为将来"可无损并入 monorepo"预留(D15)。

## 快速开始

要求:Node `^22.19 || >=24`,pnpm 11.7(仓库声明于 `packageManager`)。

```bash
pnpm install          # 安装依赖并自动装好 git 钩子(postinstall)
pnpm run build        # tsc 双面类型产出 + tsdown host/client 双面打包
pnpm run typecheck    # host + client 两个聚合程序全量类型检查
pnpm run lint         # oxlint(对齐 harness 规则子集)
pnpm run test         # vitest 单测
pnpm run test:coverage  # 逐文件 100% 覆盖率闸(提交前必过)
pnpm run hygiene      # knip + publint(建议在 build 之后跑)
pnpm run duplication  # jscpd 重复代码检查
```

> 沙箱环境备注:`.npmrc` 将 pnpm 内容 store 指向仓库内 `.pnpm-store/`(已 gitignore),使安装在工作区写沙箱下也可复现;普通环境不受影响。

## 开发流程

1. **先读规范**:任何改动前对照 [DEVELOPMENT.md](./DEVELOPMENT.md) 的红线清单(2.7)与代码红线(2.4)。
2. **决策先行**:设计决策变更必须与代码同提交一条 D 条目(决策闸);红线零例外,确需例外先追加决策、后改规范、再动代码。
3. **提交**:conventional commits(`feat/fix/docs/chore/…`);lefthook 在 pre-commit 跑增量 lint + 全量 typecheck,commit-msg 校验格式,pre-push 跑测试与覆盖率。
4. **验收**:`tools`/`core` 行为改动以单元测试为准;每个里程碑用样本短书跑通九步冒烟并产出 `meta.json`,当场人工检查(D39)。

## 里程碑路线

- [x] 架构与开发流程:workspace 三包、双面构建、检查栈、钩子、四份文档
- [x] 确定性引擎补全:章节识别、分段、组装(`core`)(D56:书名 `#`/章 `##`/节 `###`)
- [x] `tools` 工具面与书级状态文件(D58)
- [x] preset(`~/.dsh/.agent-presets/itranslation/`)安装到位,host 工具绝对路径挂载验证通过,client 浏览器半边待部署端链入(D63)
- [x] `client` UI(Run 卡进度、设置页)(D61)
- [ ] 九步流程端到端冒烟 + `meta.json` 证据链(D39)
