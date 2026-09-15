/**
 * server/ai/filler/plugins/batch/mapper.ts
 *
 * Maps multi-field batch extractions for Batch Aggregation Strategy.
 */

import type { ExtractedAnswerUpdate } from '../../core/types';

export class BatchAnswerMapper {
  public static mapBatchUpdates(rawUpdates: any[]): ExtractedAnswerUpdate[] {
    if (!Array.isArray(rawUpdates)) return [];

    return rawUpdates
      .filter((item) => item && typeof item === 'object' && item.question_id)
      .map((item) => ({
        question_id: String(item.question_id).trim(),
        question_title: String(item.question_title || item.question_id),
        answer: item.answer,
        display_text: String(item.display_text || item.answer),
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.95,
        evidence: item.evidence ? String(item.evidence) : undefined,
      }));
  }
}
