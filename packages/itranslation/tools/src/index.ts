/**
 * Host tool surface and book-level state file management for the itranslation
 * preset (D26: deterministic tools only — prepare/glossary/segment/align/
 * assemble/status). Build-wired skeleton in the first milestone; tool
 * definitions land when the preset is linked into a DSH deployment (D15).
 */
export const toolSurface = {
  package: '@deepseek-ai/dsh-itranslation-tools',
  milestone: 'skeleton',
} as const
