/**
 * server/ai/filler/core/types.ts
 *
 * Unified protocol and contract definitions for AI speed-filler strategy plugin architecture.
 */

import type OpenAI from 'openai';
import type {
  QuestionnaireModel,
  QuestionAnswerMap,
} from '../../../../src/schema/questionnaire-schema-types';

/**
 * Supported strategy plugin identifiers
 */
export type StrategyType = 'natural' | 'deep' | 'batch' | 'evidence' | 'adaptive';

/**
 * Strategy plugin metadata manifest
 */
export interface StrategyManifest {
  id: StrategyType;
  name: string;
  badge: string;
  description: string;
  recommendedFor: string[];
  features: string[];
}

/**
 * Execution context supplied by Core to plugins
 */
export interface FillerExecutionContext {
  survey: QuestionnaireModel;
  currentAnswers: QuestionAnswerMap;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionMeta?: Record<string, any>;
  aiClient: { client: OpenAI; model: string };
}

/**
 * Structured extracted answer item
 */
export interface ExtractedAnswerUpdate {
  question_id: string;
  question_title: string;
  answer: any;
  display_text: string;
  confidence: number;
  evidence?: string;
}

/**
 * Standard decision result produced by strategy plugins
 */
export interface StrategyDecisionResult {
  /**
   * Action type:
   * - 'ask': normal conversational question
   * - 'fill': silent or prefilled answer recorded
   * - 'confirm': politely asking user to verify moderate-confidence inference
   * - 'finish': graceful wrapping up, directing user back to standard survey
   */
  type: 'ask' | 'fill' | 'confirm' | 'finish';
  reply: string;
  updates: ExtractedAnswerUpdate[];
  shouldContinue: boolean;
  metadata?: {
    strategyId: StrategyType;
    stepInfo?: string;
    confidenceSummary?: Record<string, number>;
    evidenceSnippet?: Record<string, string>;
    followUpDepth?: number;
    activeBundle?: string[];
    delegatedStrategy?: StrategyType;
  };
}

/**
 * Strategy Plugin contract
 */
export interface StrategyPlugin {
  manifest: StrategyManifest;
  /**
   * Generates opening welcome/prompt before user input
   */
  generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult>;
  /**
   * Executes strategy processing for user reply
   */
  executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult>;
}
