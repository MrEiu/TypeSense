/**
 * server/ai/filler/filler-service.ts
 *
 * Facade service for AI conversational questionnaire auto-filler.
 * Delegates lifecycle and execution to the thin FillerCore and strategy plugins.
 */

import {
  type QuestionnaireModel,
  type QuestionAnswerMap,
} from '../../../src/schema/questionnaire-schema-types';
import './plugins'; // Ensure all strategy plugins are registered
import { FillerCore } from './core/filler-core';
import { StrategyPluginRegistry } from './core/registry';
import type {
  ExtractedAnswerUpdate,
  StrategyDecisionResult,
} from './core/types';

export { ExtractedAnswerUpdate };

export interface ChatFillerRequest {
  survey: QuestionnaireModel;
  currentAnswers: QuestionAnswerMap;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  strategy?: string;
  sessionMeta?: Record<string, any>;
}

export interface ChatFillerResponse {
  success: boolean;
  type?: 'ask' | 'fill' | 'confirm' | 'finish';
  reply: string;
  updates: ExtractedAnswerUpdate[];
  should_continue?: boolean;
  metadata?: Record<string, any>;
}

export class SurveyFillerService {
  /**
   * Main entrypoint: Chat and extract answers using the requested or survey strategy
   */
  public static async chatAndExtract(req: ChatFillerRequest): Promise<ChatFillerResponse> {
    const { survey, currentAnswers = {}, messages = [], strategy, sessionMeta } = req;
    const strategyId = strategy || (survey as any).aiStrategy;

    const decision: StrategyDecisionResult = await FillerCore.execute({
      survey,
      currentAnswers,
      messages,
      strategyId,
      sessionMeta,
    });

    return {
      success: true,
      type: decision.type,
      reply: decision.reply,
      updates: decision.updates,
      should_continue: decision.shouldContinue,
      metadata: decision.metadata,
    };
  }

  /**
   * Generates opening welcome using the requested or survey strategy
   */
  public static async generateOpeningPrompt(
    _ai: any,
    survey: QuestionnaireModel,
    strategyId?: string
  ): Promise<ChatFillerResponse> {
    const effectiveStrategy = strategyId || (survey as any).aiStrategy;
    const decision = await FillerCore.generateOpening(survey, effectiveStrategy);

    return {
      success: true,
      type: decision.type,
      reply: decision.reply,
      updates: decision.updates,
      should_continue: decision.shouldContinue,
      metadata: decision.metadata,
    };
  }

  /**
   * Lists all available strategy manifests
   */
  public static getStrategies() {
    return StrategyPluginRegistry.listManifests();
  }
}
