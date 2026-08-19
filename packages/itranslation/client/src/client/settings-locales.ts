/** Section copy for the itranslation settings page (English only). */
export const en = {
  nav: 'Itranslation',
  intro: 'Prompt templates used by the agent for each LLM step. Leave blank to use no extra prompt.',
  preRead: 'Pre-reading prompt',
  translate: 'Translation prompt',
  audit: 'Audit prompt',
  revise: 'Revision prompt',
  save: 'Save prompts',
  saving: 'Saving…',
  loading: 'Loading Itranslation settings…',
  failed: 'Failed to load:',
  missing: 'The itranslation settings namespace was not detected; saving is unavailable.',
} as const

export type SettingsKey = keyof typeof en
