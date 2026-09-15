/**
 * server/ai/filler/core/filler-core.ts
 *
 * Thin orchestrator core for conversational survey auto-filling.
 * Handles lifecycle, strategy dispatching, and answer integrity verification.
 */

import type {
  QuestionnaireModel,
  QuestionItemModel,
  QuestionAnswerMap,
  QuestionAnswerValue,
} from '../../../../src/schema/questionnaire-schema-types';
import {
  normalizeOptions,
  normalizeStatements,
} from '../../../../src/schema/normalizer';
import { LlmClientFactory } from '../../shared/llm-client';
import { StrategyPluginRegistry } from './registry';
import type {
  FillerExecutionContext,
  StrategyDecisionResult,
  ExtractedAnswerUpdate,
  StrategyType,
} from './types';

export interface DispatchOptions {
  survey: QuestionnaireModel;
  currentAnswers: QuestionAnswerMap;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  strategyId?: string;
  sessionMeta?: Record<string, any>;
}

export class FillerCore {
  /**
   * Dispatches step execution to selected strategy plugin
   */
  public static async execute(options: DispatchOptions): Promise<StrategyDecisionResult> {
    const { survey, currentAnswers, messages, strategyId, sessionMeta } = options;
    const plugin = StrategyPluginRegistry.get(strategyId);
    const aiClient = LlmClientFactory.getClient(120000);

    const ctx: FillerExecutionContext = {
      survey,
      currentAnswers,
      messages,
      sessionMeta,
      aiClient,
    };

    let decision: StrategyDecisionResult;
    if (messages.length === 0) {
      decision = await plugin.generateOpening(ctx);
    } else {
      decision = await plugin.executeStep(ctx);
    }

    // Sanitize and validate extracted answers
    const sanitizedUpdates = this.validateAndSanitizeUpdates(survey.questions, decision.updates);
    decision.updates = sanitizedUpdates;

    // Attach strategy identifier to metadata
    if (!decision.metadata) {
      decision.metadata = { strategyId: plugin.manifest.id };
    } else {
      decision.metadata.strategyId = plugin.manifest.id;
    }

    return decision;
  }

  /**
   * Generates opening welcome using target strategy
   */
  public static async generateOpening(
    survey: QuestionnaireModel,
    strategyId?: string
  ): Promise<StrategyDecisionResult> {
    return this.execute({
      survey,
      currentAnswers: {},
      messages: [],
      strategyId,
    });
  }

  /**
   * Strict validation & normalization of extracted updates against schema
   */
  public static validateAndSanitizeUpdates(
    questions: QuestionItemModel[],
    rawUpdates: ExtractedAnswerUpdate[]
  ): ExtractedAnswerUpdate[] {
    if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) return [];

    const validUpdates: ExtractedAnswerUpdate[] = [];
    const questionMap = new Map<string, QuestionItemModel>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }

    for (const item of rawUpdates) {
      if (!item || typeof item !== 'object') continue;
      const qId = String(item.question_id || '').trim();
      const q = questionMap.get(qId);
      if (!q) continue;

      const opts = normalizeOptions(q.options);
      const stmts = normalizeStatements(q.statements);
      const rawAns = item.answer;

      let validatedAnswer: QuestionAnswerValue = null;
      let displayText = '';

      switch (q.type) {
        case 'single_choice': {
          const idx = Number(rawAns);
          if (Number.isInteger(idx) && idx >= 0 && idx < opts.length) {
            validatedAnswer = idx;
            displayText = opts[idx].label;
          }
          break;
        }

        case 'multiple_choice': {
          if (Array.isArray(rawAns)) {
            const validIndices = Array.from(
              new Set(
                rawAns
                  .map(Number)
                  .filter((n) => Number.isInteger(n) && n >= 0 && n < opts.length)
              )
            ).sort((a, b) => a - b);

            if (validIndices.length > 0) {
              validatedAnswer = validIndices;
              displayText = validIndices.map((i) => opts[i].label).join('、');
            }
          }
          break;
        }

        case 'text_input': {
          if (rawAns !== undefined && rawAns !== null) {
            const str = String(rawAns).trim();
            if (str.length > 0) {
              validatedAnswer = str;
              displayText = str.length > 30 ? `${str.slice(0, 30)}...` : str;
            }
          }
          break;
        }

        case 'likert_scale': {
          if (stmts.length === 0) {
            const idx = Number(rawAns);
            if (Number.isInteger(idx) && idx >= 0 && idx < opts.length) {
              validatedAnswer = idx;
              displayText = opts[idx].label;
            }
          } else if (rawAns && typeof rawAns === 'object' && !Array.isArray(rawAns)) {
            const matrixRecord: Record<string, number> = {};
            const displayParts: string[] = [];

            for (let sIdx = 0; sIdx < stmts.length; sIdx++) {
              const stmtKey = String(sIdx);
              const namedKey = stmts[sIdx].label;
              const val = (rawAns as any)[stmtKey] ?? (rawAns as any)[namedKey];
              if (val !== undefined && val !== null) {
                const optIdx = Number(val);
                if (Number.isInteger(optIdx) && optIdx >= 0 && optIdx < opts.length) {
                  matrixRecord[stmtKey] = optIdx;
                  displayParts.push(`${stmts[sIdx].label}: ${opts[optIdx].label}`);
                }
              }
            }

            if (Object.keys(matrixRecord).length > 0) {
              validatedAnswer = matrixRecord;
              displayText = displayParts.join('; ');
            }
          }
          break;
        }
      }

      if (validatedAnswer !== null) {
        validUpdates.push({
          question_id: q.id,
          question_title: q.title,
          answer: validatedAnswer,
          display_text: displayText || String(validatedAnswer),
          confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.9,
          evidence: item.evidence ? String(item.evidence).trim() : undefined,
        });
      }
    }

    return validUpdates;
  }
}
