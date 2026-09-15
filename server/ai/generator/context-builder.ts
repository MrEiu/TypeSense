/**
 * server/ai/generator/context-builder.ts
 *
 * Context aggregator for AI survey generation (documents, templates, options).
 */

import { TemplateService } from '../../template-service';

export interface GenerationContextOptions {
  prompt?: string;
  documentText?: string;
  templateIds?: string[];
  targetCount?: number;
  enableJumpLogic?: boolean;
}

export class GeneratorContextBuilder {
  /**
   * Truncate and sanitize reference document text to safe token budget limit
   */
  public static truncateDocumentText(docText?: string, maxChars: number = 25000): string {
    if (!docText) return '';
    return docText.slice(0, maxChars);
  }

  /**
   * Retrieve formatted templates context for injection into LLM prompts
   */
  public static buildTemplateContext(templateIds?: string[]): string {
    if (!templateIds || templateIds.length === 0) return '';
    return TemplateService.formatTemplatesForPrompt(templateIds);
  }
}
