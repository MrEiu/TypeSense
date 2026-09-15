/**
 * server/ai/filler/plugins/natural/mapper.ts
 *
 * Maps LLM structured tool arguments into typed ExtractedAnswerUpdate array.
 */

import type { ExtractedAnswerUpdate } from '../../core/types';

export class NaturalAnswerMapper {
  /**
   * Maps raw tool arguments into standard updates
   */
  public static mapToolUpdates(toolUpdates: any[]): ExtractedAnswerUpdate[] {
    if (!Array.isArray(toolUpdates)) return [];

    return toolUpdates
      .filter((item) => item && typeof item === 'object' && item.question_id)
      .map((item) => ({
        question_id: String(item.question_id).trim(),
        question_title: String(item.question_title || item.question_id),
        answer: item.answer,
        display_text: String(item.display_text || item.answer),
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.9,
        evidence: item.evidence ? String(item.evidence) : undefined,
      }));
  }
}
