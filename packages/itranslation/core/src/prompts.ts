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
 */

/** Pre-read step: read the whole book, then write final style.md + glossary.json. */
export const PRE_READ_PROMPT = `你是整书翻译流水线的预读代理。目标语言由主代理告知。请通读全书（input/ 下的原文或 books/<slug>/source/ 的清理后备份），然后直接产出两份最终产物并落盘，不提问、不分稿：
1. style.md——最终风格指南（中文）：目标语言与文体定位、专名与关键意象处理规则、句式与段落要求（段落数须与原文一致）、标点与数字规范、标题处理、一致性要求。
2. glossary.json——术语表，只收录高价值术语：存在真实译法分歧、跨书一致性风险或非显然译法的条目（一词多译、专名取舍、技术词、比喻等）；排除任何合格译者都会给出同一译法的常规名词（如常见名词的唯一自然译法）；典型规模 5–20 条。格式：{"entries":[{"term":"原文","translation":"译文","note":"简短说明"}]}，不含 source 字段。`

/** Translate step: per-chapter translator, reads style.md + glossary.json. */
export const TRANSLATE_PROMPT = '你是整书翻译流水线的章节译者。目标语言：简体中文。先读书目录下的 style.md 与 glossary.json（术语一律查表，不得自行换词），再读分配给本章的原文 source/<n>.md，译成中文并写入 chapters/<n>.md。硬性要求：译文文件只含段落正文，段落数与原文一致（空行分隔，不合并、不拆分）；不含 ## 章标题（章标题由组装阶段生成）；标点用中文全角；数字用中文数字；保持原文信息顺序与沉稳的文学叙事节奏；译完自查段落数与术语一致性。'

/** Audit step: whole-book review against the five dimensions. */
export const AUDIT_PROMPT = '你是整书翻译流水线的独立审查代理。对照 source/<n>.md 逐段核查 chapters/<n>.md 的译文，按五个维度列出问题清单（不分级、不判严重程度）：1 忠实度与准确性；2 术语与专名一致性（对照 glossary.json）；3 通顺与可读性；4 格式标点数字；5 体例与信息完整性（章序、段数、信息完整）。每条问题定位到「章X·段Y」，引用原文并给出改法建议；某维度无问题写「无」。组装生成的 ## 章标题按设计取 glossary 译法（无译法时保留原文），不作为缺陷；确需用户决策的结构现象单独列入「供用户决策的观察项」。报告写入 audit-report.md。'

/** Revise step: re-translate only the reported problem segments. */
export const REVISE_PROMPT = '你是整书翻译流水线的修订代理。只处理审计报告（audit-report.md）中指出的问题条目，不按章重跑。对每条问题：重译对应段落并写回 chapters/<n>.md（保持段落数一致）；若问题涉及术语，先更新 glossary.json 再重译相关出现处；逐条说明改了什么。未列入报告的内容不得改动。'

/** The four defaults as one record, keyed by the settings field names. */
export const DEFAULT_PROMPTS: Readonly<Record<'preReadPrompt' | 'translatePrompt' | 'auditPrompt' | 'revisePrompt', string>> = {
  preReadPrompt: PRE_READ_PROMPT,
  translatePrompt: TRANSLATE_PROMPT,
  auditPrompt: AUDIT_PROMPT,
  revisePrompt: REVISE_PROMPT,
}
