/**
 * server/ai/filler/plugins/evidence/mapper.ts
 *
 * Maps and filters evidence-backed answers with strict confidence thresholds.
 */

import type { ExtractedAnswerUpdate } from '../../core/types';

export class EvidenceAnswerMapper {
  public static readonly HIGH_CONFIDENCE_THRESHOLD = 0.85;
  public static readonly MODERATE_CONFIDENCE_THRESHOLD = 0.60;

  /**
   * Filters and normalizes high-confidence answers with verified evidence
   */
  public static mapHighConfidenceUpdates(toolUpdates: any[]): ExtractedAnswerUpdate[] {
    if (!Array.isArray(toolUpdates)) return [];

    return toolUpdates
      .filter((item) => {
        if (!item || typeof item !== 'object' || !item.question_id) return false;
        const conf = typeof item.confidence === 'number' ? item.confidence : 0;
        return conf >= this.HIGH_CONFIDENCE_THRESHOLD && !!item.evidence;
      })
      .map((item) => ({
        question_id: String(item.question_id).trim(),
        question_title: String(item.question_title || item.question_id),
        answer: item.answer,
        display_text: String(item.display_text || item.answer),
        confidence: item.confidence,
        evidence: String(item.evidence).trim(),
      }));
  }

  /**
   * Identifies moderate-confidence candidates requiring explicit user confirmation
   */
  public static extractConfirmationCandidates(toolUpdates: any[]): Array<{
    question_id: string;
    suggested_answer: any;
    display_text: string;
    evidence: string;
    confidence: number;
  }> {
    if (!Array.isArray(toolUpdates)) return [];

    return toolUpdates
      .filter((item) => {
        if (!item || typeof item !== 'object' || !item.question_id) return false;
        const conf = typeof item.confidence === 'number' ? item.confidence : 0;
        return conf >= this.MODERATE_CONFIDENCE_THRESHOLD && conf < this.HIGH_CONFIDENCE_THRESHOLD;
      })
      .map((item) => ({
        question_id: String(item.question_id).trim(),
        suggested_answer: item.answer,
        display_text: String(item.display_text || item.answer),
        evidence: String(item.evidence || '').trim(),
        confidence: item.confidence,
      }));
  }
}
