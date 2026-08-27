/** Locale bundles for the itranslation prompt-template settings section. */

/** Locale keys the section renders. */
export type SettingsKey =
  | 'nav' | 'intro' | 'preRead' | 'translate' | 'audit' | 'revise'
  | 'targetLanguage' | 'inputFile' | 'configIntro'
  | 'save' | 'saving' | 'loading' | 'failed' | 'missing'

/** English copy. */
export const en: Record<SettingsKey, string> = {
  nav: 'Itranslation',
  intro: 'Prompt templates used by the agent for each LLM step. Leave blank to use no extra prompt.',
  preRead: 'Pre-reading prompt',
  translate: 'Translation prompt',
  audit: 'Audit prompt',
  revise: 'Revision prompt',
  configIntro: 'Automatic pipeline configuration:',
  targetLanguage: 'Target language',
  inputFile: 'Input book (input/<file>.md; empty = auto-discover)',
  save: 'Save prompts',
  saving: 'Saving…',
  loading: 'Loading Itranslation settings…',
  failed: 'Failed to load:',
  missing: 'The itranslation settings backend is unavailable; saving is disabled.',
}

/** Simplified Chinese copy. */
export const zh: Record<SettingsKey, string> = {
  nav: '整书翻译',
  intro: 'Agent 各 LLM 步骤使用的提示词模板。留空表示不附加额外提示词。',
  preRead: '预读提示词',
  translate: '翻译提示词',
  audit: '审查提示词',
  revise: '修订提示词',
  configIntro: '流水线自动配置：',
  targetLanguage: '目标语言',
  inputFile: '待译书目（input/<file>.md；留空自动发现）',
  save: '保存提示词',
  saving: '正在保存…',
  loading: '正在加载整书翻译设置…',
  failed: '加载失败：',
  missing: '整书翻译设置后端不可用，保存不可用。',
}
