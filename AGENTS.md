# AGENTS.md

本仓库是 Itranslation(整本书翻译生产线)的 DSH 插件实现。规范唯一来源是 [DEVELOPMENT.md](./DEVELOPMENT.md),设计唯一依据是 [DESIGN.md](./DESIGN.md);本文档只给出 agent 工作守则,不新增规范。

## 守则(零例外)

1. **红线清单**(DEVELOPMENT.md §2.7):不改 `~/deepseek-harness` 任何文件(只读参考);不改部署 shipped preset(只复制副本);无 Python 依赖、不建 subprocess 桥;不绕过 DESIGN.md §6 四类约束;每次翻译运行必产 `meta.json`;不做成本闸;不新增第五份仓库文档。
2. **代码红线**(§2.4):访问服务用 `ctx.get(name)` + undefined 检查;一切副作用可逆;注册前先 Inspect 查询真实 API;Host/Client 只走 Package 私有 JSON RPC;模型调用一律走 DSH `llm` 路由与子代理,禁止自建 API 客户端。
3. **决策闸**:任何设计决策变更 → DEVELOPMENT.md「决策日志」追加 D 条目,与代码同提交。确需违反规范时:先追加决策、后修改规范、再动代码。
4. **覆盖率纪律**:`packages/*/*/src` 逐文件 100%(语句/分支/函数/行)。types-only 文件豁免;API 桶文件不得退化为纯 re-export(v8 无法度量),需承载真实契约常量。
5. **提交纪律**:conventional commits;钩子会拦下不合规提交,不要用 `--no-verify` 绕过。

## 常用命令(根目录)

```bash
pnpm install            # 依赖 + 自动安装 git 钩子
pnpm run build          # 双面构建(tsc -b + tsdown)
pnpm run typecheck      # host + client 聚合类型检查
pnpm run lint           # oxlint;pnpm run lint:fix 自动修复
pnpm run test:coverage  # 单测 + 逐文件 100% 覆盖率闸
pnpm run hygiene        # knip + publint(先 build)
pnpm run duplication    # jscpd 重复代码
```

## 工程约定速览

- **双面构建**:Host 面 `tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host`;Client 面同理。client 包的 `tsdown.config.ts` 替换 workspace 默认,必须同时重述 node 半边与 browser 半边。
- **测试归属**:client 包测试放 `packages/itranslation/client/tests/`(host 聚合排除、client 聚合包含),其余包测试归 host 聚合。
- **pnpm store**:`.npmrc` 把 store 指向仓库内 `.pnpm-store/`(沙箱适配),不要删掉这行后带 `node_modules` 状态提交。
- **harness 对齐**:版本组合(Node/pnpm/TS6/oxlint/tsdown/vitest)与 harness 保持一致;不确定的约定先查 `~/deepseek-harness`(只读),再写实现。

## 当前里程碑

- `core`:确定性引擎。已落地 `slugify`(D42)、`segmentParagraphs`/`countSentences`(D22/D24);提取、章节识别、组装待补。
- `tools`、`client`:构建管线骨架;DSH 包依赖链入、cordis.yml/preset 组合、真实工具与 UI 待后续里程碑。
- 里程碑验收(D39):样本短书跑通九步冒烟并产出 `meta.json`,当场人工检查,不存档。
