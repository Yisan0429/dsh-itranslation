/**
 * Built-in default prompts for the four LLM steps of the itranslation preset
 * (pre-read / translate / audit / revise). The client package's settings
 * schema uses these as its defaults, and the `itranslation_prompts` tool
 * falls back to them when the settings namespace is not mounted — one source
 * of truth, shared by both consumers (D-prompts).
 *
 * Each prompt is an ADDITIONAL instruction block appended by the main agent
 * to the corresponding subagent's task. Written in Chinese, matching the
 * preset's working language.
 *
 * Every prompt opens with the SAME hard read boundary: the listed inputs are
 * complete and pre-verified, so the agent must not even consider looking at
 * anything else — not the full book, not other chapters, not pipeline
 * sources, not workspace files. Enforcement is belt-and-suspenders: the
 * dispatch tool also restricts the child's tool surface (toolFilter) to the
 * scoped read/write tools plus glossary, so there is no other way to touch a
 * file even if the idea arose.
 */

/** Shared read-boundary preamble, interpolated into every step prompt. */
function readBoundary(allowed: string): string {
  return `【读取边界（最高优先级）】本任务的全部输入文件已列出并经过流水线校验、内容完备：${allowed}。`
    + '直接读取这些文件即可，任务所需信息全部在其中；文件读取使用 itranslation_scoped_read、写入使用 '
    + 'itranslation_scoped_write（工具已按本任务白名单限定路径）。若输入文件缺失或无法读取，停止处理并在固定字段报告中说明。'
}

/** Shared single-purpose preamble: only the step's own work, nothing else. */
function singlePurpose(work: string): string {
  return `【职责】你的工作是${work}。直接完成，输出中只含工作结果，不附带任何分析、检查、解释或评论。`
}

/** Pre-read step: read the whole book, then write glossary.json + analysis.md. */
export const PRE_READ_PROMPT = `你是整书翻译流水线的预读代理。目标语言由主代理告知。

${readBoundary('input/<file>.md（E2M 转出的原始 Markdown，含全书标题与正文；不读分章后的 source/<n>.md）')}

通读全书后直接产出两份最终产物并落盘（用 itranslation_scoped_write 写入；术语条目也可用 itranslation_glossary 增补，仅限本书 slug）：
1. glossary.json——术语表，只收录高价值术语：存在真实译法分歧、跨书一致性风险或非显然译法的条目（一词多译、专名取舍、技术词、比喻等）；排除任何合格译者都会给出同一译法的常规名词（如常见名词的唯一自然译法）；宁缺毋滥，只收确有必要的条目。格式：{"entries":[{"term":"原文","translation":"译文","note":"简短说明"}]}，不含 source 字段。
2. analysis.md——书的档案（中文），固定章节结构如下，只填写内容、不改动章节结构：①背景（题材、设定、时代/语境、体裁等）；②摘要（全书内容概览）；③逻辑线（章节/叙事/论证结构，各章如何衔接推进）；④风格要点（完整风格指南，取代原独立 style.md：目标语言与文体定位、专名与关键意象处理规则、句式与段落要求（段落数须与原文一致）、标点与数字规范、标题处理、一致性要求；本节只写规则，不写任何段落数/句数等统计数字——这些由流水线工具统计）；⑤备注（可选）：易错点、术语争议或需主代理转告用户的决策项，无内容则省略该节；其余各节确无内容时写「无」，不删除章节。`

/** Translate step: per-chapter translator, reads analysis.md + glossary.json. */
export const TRANSLATE_PROMPT = `目标语言：简体中文。

${readBoundary('produce/<slug>/analysis.md、produce/<slug>/glossary.json、source/<n>.md（本章原文）')}

${singlePurpose('把本章原文逐块译成中文，写入 chapters/<n>.md')}

用 itranslation_scoped_read 依次读取 analysis.md（背景与风格语境）、glossary.json（术语按表直译）、source/<n>.md（本章原文），用 itranslation_scoped_write 把译文写入 chapters/<n>.md。逐块翻译：源文件每一块（含正文内的 # / ### 标题行，属正文，保留其标题层级；源文件不含 ## 章标题，译文也不得自造）都译出，逐块对应、不合并、不拆分；标点用中文全角；数字用中文数字；按原文顺序。`

/** Audit step: whole-book review against the five dimensions. */
export const AUDIT_PROMPT = `你是整书翻译流水线的独立审查代理。

${readBoundary('全部 source/<n>.md 与 chapters/<n>.md、glossary.json、analysis.md、audit-report.md')}

${singlePurpose('逐段核查译文并按五个维度列出问题清单')}

用 itranslation_scoped_read 读取上述文件，对照 source/<n>.md 逐段核查 chapters/<n>.md 的译文，按五个维度列出问题清单（不分级、不判严重程度）：1 忠实度与准确性（对照 analysis.md 的背景与逻辑线核查）；2 术语与专名一致性（对照 glossary.json）；3 通顺与可读性；4 格式标点数字；5 体例与信息完整性（章序、段数、信息完整）。每条问题定位到「章X·段Y」，引用原文并给出改法建议；某维度无问题写「无」。组装生成的 ## 章标题按设计取 glossary 译法（无译法时保留原文），不作为缺陷；正文结构层面的现象（如标题层级）一律列入「供用户决策的观察项」。报告用 itranslation_scoped_write 写入 audit-report.md。`

/** Revise step: re-translate only the reported problem segments. */
export const REVISE_PROMPT = `你是整书翻译流水线的修订代理。读取范围：audit-report.md、全部 source/<n>.md、chapters/<n>.md、glossary.json、analysis.md（沿用审计会话已加载的读取边界）。

${singlePurpose('按审计报告逐条修订对应的译文段落')}

只处理审计报告（audit-report.md）中指出的问题条目，不按章重跑。对每条问题：重译对应段落并用 itranslation_scoped_write 写回 chapters/<n>.md（保持段落数一致）；若问题涉及术语，先用 itranslation_glossary（仅限本书 slug）更新 glossary.json 再重译相关出现处；逐条说明改了什么。未列入报告的内容不得改动。`

/** The four defaults as one record, keyed by the settings field names. */
export const DEFAULT_PROMPTS: Readonly<Record<'preReadPrompt' | 'translatePrompt' | 'auditPrompt' | 'revisePrompt', string>> = {
  preReadPrompt: PRE_READ_PROMPT,
  translatePrompt: TRANSLATE_PROMPT,
  auditPrompt: AUDIT_PROMPT,
  revisePrompt: REVISE_PROMPT,
}
