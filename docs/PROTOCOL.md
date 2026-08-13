# 协议契约（PROTOCOL.md，v1）

> 本文件是**唯一权威协议契约**：插件模式与 Itranslation CLI 产物之间的互操作边界 = 工作区文件协议 + 对齐契约（§3/§5），两侧实现语言各自选择（D14：本仓库 TS、Itranslation Python），**共享的是协议不是代码**。
> 变更规则见 DEVELOPMENT.md §6（破坏性变更 = 版本号升级 + 双仓同步落地）。
> 当前状态：v1（M1 起生效的文件协议部分）；§2 thin CLI 契约与 §4 子进程桥 = **Mode B 议题的预留知识**（D14 桥取消，当前不实现、不依赖）。

## 1. 总则

- 每个协议载体带 `version` 字段（整数）；minor 变更向后兼容（旧字段保留、新字段可缺省），破坏性变更升大版本并双仓同步。
- 幂等：所有工具同参数重放，结果与文件状态一致（除 `updated_at` 时间戳）。
- 错误模型（对齐 DSH 工具契约惯例，adding-a-tool.md）：**基础设施失败 = 工具抛异常**（registry 记 isError）；**领域非理想结果 = 成功 canonical 值** `{"ok": false, "error": "<中文可行动文案>", "code": "<STABLE_CODE>"}`——失配、文件缺失等是"值"不是异常。
- 编码：全部 UTF-8；换行 `\n`；路径分隔 `/`（相对工作区根）。

## 2. thin CLI 契约 ——【预留：Mode B 议题，当前不实现（D14）】

> 本节省略原子进程调用细节；若未来 Mode B 需要类型化编排（agent 不经 bash 直跑 CLI），先重开决策（DECISIONS），再按 RESEARCH-DSH.md §5/§6 的 `ctx.subprocess` 调研结论补全本节。当前 Mode B 形态 = agent 用内置 bash 工具直跑 `uv run python translate_book.py`，无插件侧进程。
> op 语义与下列**工具级契约（§2.1 表格）保持一致**——即便实现语言不同，canonical 结果形状不变。

### 2.1 op/工具契约（形状对 TS 工具与未来 thin CLI 均有效）

| op | 参数 | 结果（ok:true 时） | 幂等性说明 |
|---|---|---|---|
| `prepare` | `path`, `--gutenberg`（戏剧版式开关） | `{output_path, structure: [{title, units}]}` | 同输入重跑覆盖产出 |
| `chunk` | `text_path`, `mode=prose\|verse`, `target_tokens`, `max_tokens`, `overlap` | `{chunks_path, units: [{id, count, long_units}]}` | 确定性（同参数同输出） |
| `brief` | `book`, `chunk_id`, `rat_top_k?` | `{brief_path, hits: {glossary: n, style: n}}` | 读-only + 写 brief 文件 |
| `glossary_get` | `book` | `{glossary: <完整对象>}` | 读 |
| `glossary_set` | `book`, `term`, `entry` | `{status: "updated"\|"pending"}` | 同值重放无漂移 |
| `glossary_merge` | `book`, `terms` | `{added, changed, removed}` | 合并语义（重复键后者胜，计数稳定） |
| `style_get` / `style_set` | `book` / `book`, `patch` | 同上模式 | 同上 |
| `checkpoint_load` | `book`, `scene_index` | `{checkpoint \| null}` | 读 |
| `checkpoint_save` | `book`, `scene_index`, `data` | `{checkpoint_path, content_hash}` | 同 data 重放同 hash |
| `assemble` | `book`, `mode`, `format`, `out` | `{output_path, mismatch: [{unit, expected, actual}], stats}` | 产出确定性 |
| `audit` | `book` | `{drifts: [{term, translations, locations}], total}` | 读 |
| `status` | `book` | `{scenes: [{index, state, chunks_done, content_hash}], counts}` | 读 |

- 参数名：TS 工具为 schemastery DSL（camelCase）；表内 `--gutenberg` 记法仅为语义说明，不表示 CLI flag。
- 所有路径参数解析于工作区根内（R4 白名单：`input/`、`state/`、`output/`、`reports/`）；book slug 匹配 `^[a-z0-9-]+$`。
- 错误码表（稳定；领域非理想结果以 `ok:false` canonical 值返回，不抛异常）：

| code | 含义 |
|---|---|
| `E_NOT_FOUND` | 文件/书不存在 |
| `E_BAD_ARGS` | 参数缺失/越界（含路径逃逸） |
| `E_VERSION` | 协议/版本不匹配 |
| `E_STATE` | 状态文件损坏或 schema 不符 |
| `E_IO` | 读写失败 |
| `E_MISMATCH` | 组装失配（`assemble` 返回 ok:true 但 mismatch>0 时也带此码提示） |

## 3. 工作区文件协议

### 3.1 布局（与 DESIGN §5.1 一致，此处为规范层）

```
input/<book>.md                       state/<book>/glossary.json
state/<book>/style.json               state/<book>/briefs/<scene>__<chunk>.md
state/<book>/drafts/<scene>.md        state/<book>/checkpoints/checkpoint_<slug>__<scene:03d>.json
state/<book>/reviews/<scene>.md       output/<book>/<book>.{txt,md,epub}
reports/<book>/audit_*.json
```

### 3.2 glossary.json（version 1）

```jsonc
{
  "version": 1,
  "book": "hamlet",
  "terms": {
    "<en_term>": {
      "zh": "<译法>",
      "note": "<可选说明>",
      "aliases": ["<候选译法>"],          // 可选；同词多译必须记录而非静默漂移
      "first_seen": "<scene_id>",          // 可选
      "source": "human" | "agent" | "pending"   // pending = 未定，禁止用于翻译输出
    }
  },
  "pending": ["<en_term>"],
  "updated_at": "<ISO8601 UTC>"
}
```

规则：先读后写；`source:"pending"` 的术语**禁止出现在译文**（翻译遇之须请示/记 pending）；人工裁定后经 `glossary_merge` 转正；审计对比 expected（本表）vs observed（译文抽取）。

### 3.3 style.json（version 1）

```jsonc
{
  "version": 1,
  "book": "hamlet",
  "global": {"register": "<文体总纲>", "notes": []},
  "characters": {"<Name>": {"voice": "<语气描述>", "address": "<译名>"}},
  "policies": {
    "famous_lines": "retranslate",      // 决策 D11，固定为 retranslate
    "stage_directions": "translate",    // 译文以〔〕包裹
    "verse": "line_for_line"            // 行对行
  },
  "updated_at": "<ISO8601 UTC>"
}
```

### 3.4 checkpoint JSON（与 Itranslation CLI 同构，不新增字段）

```jsonc
{
  "completed_chunks": ["chunk_0000", ...],
  "failed_chunks": [{"chunk": "chunk_0003", "error": "..."}],
  "translations": {"chunk_0000": "<␟ 分隔译文>"},
  "content_hash": "<源文本哈希>",
  "updated_at": "<ISO8601 UTC>"
}
```

命名 `checkpoint_<book_slug>__<scene_index:03d>.json`；`content_hash` 变化 = 源文本已变，禁止盲目续跑。

### 3.5 草稿 drafts/<scene>.md（对齐格式）

- 每行一个对齐单元，`␟` 为单元分隔符（与 CLI 互操作）。
- **行模式（verse，M1/Hamlet 默认）**：行数 = 原文行数；空行保留；舞台指示行照策略翻译并以 `〔〕` 包裹；人物名行原样保留不译。
- **句模式（prose）**：句数对齐正文句（context 句不译、不计数），§/¶ 结构标记原样保留。
- 契约遵守度由 `assemble` 的 mismatch 统计判定：`mismatch>0` 即质量闸门失败（DESIGN §4），需定位重译。

## 4. 子进程桥错误传播 ——【预留：Mode B 议题，当前不适用（D14）】

> 桥已取消（D14）。本节省略原 thin CLI 进程错误传播细节；若未来重开 Mode B 类型化编排议题，按 RESEARCH-DSH.md §5/§6 补全（resolveExecutable 失败即报错、超时/取消经 graceMs 树级终止、stderr 截断摘要 ≤2KB 归一为 `ok:false`）。

## 5. 版本兼容策略

- 文件协议：读取方必须容忍未知字段（向前兼容）；写入方不得删字段（除非大版本）。
- 实现一致性：本仓库 TS 实现与 Itranslation Python 实现的互操作以 §3 文件协议 + golden 测试为准（DEVELOPMENT §6）；任何一侧改动协议须双仓同步 + 联测记录。
- 任何协议改动必须同时更新本文件与 DECISIONS（决策条目），再动实现（docs-first）。
