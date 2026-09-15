/**
 * server/ai/filler/plugins/deep/mapper.ts
 *
 * Maps extracted insights and quantitative answers for Deep Interview Strategy.
 */

import type { ExtractedAnswerUpdate } from '../../core/types';

export class DeepAnswerMapper {
  /**
   * Normalizes updates extracted during deep interview
   */
  public static mapToolUpdates(toolUpdates: any[], insightSummary?: string): ExtractedAnswerUpdate[] {
    if (!Array.isArray(toolUpdates)) return [];

    return toolUpdates
      .filter((item) => item && typeof item === 'object' && item.question_id)
      .map((item) => {
        let displayText = String(item.display_text || item.answer);
        if (insightSummary && item.question_id.includes('reason')) {
          displayText = `${displayText} (深挖因果: ${insightSummary})`;
        }

        return {
          question_id: String(item.question_id).trim(),
          question_title: String(item.question_title || item.question_id),
          answer: item.answer,
          display_text: displayText,
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.92,
          evidence: item.evidence ? String(item.evidence) : undefined,
        };
      });
  }
}
