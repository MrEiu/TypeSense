/**
 * server/ai/filler/plugins/adaptive/engine.ts
 *
 * Strategy Router for Adaptive Exploration Strategy.
 * Dynamically dispatches execution to Natural, Deep, Batch, or Evidence plugins based on runtime state.
 */

import type { FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { StrategyPluginRegistry } from '../../core/registry';
import { AdaptiveContextBuilder } from './context';
import { AdaptiveAnswerMapper } from './mapper';

export class StrategyRouter {
  public static async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const profile = AdaptiveContextBuilder.evaluateProfile(ctx.survey.questions, ctx.currentAnswers, ctx.messages);
    const targetPlugin = StrategyPluginRegistry.get(profile.recommendedStrategy);

    const decision = await targetPlugin.generateOpening(ctx);
    return AdaptiveAnswerMapper.decorateDecision(decision, profile.recommendedStrategy);
  }

  public static async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const profile = AdaptiveContextBuilder.evaluateProfile(ctx.survey.questions, ctx.currentAnswers, ctx.messages);

    // If user expresses impatience, gracefully wrap up immediately
    if (profile.userStyle === 'impatient') {
      return {
        type: 'finish',
        reply: '收到！理解您的时间非常宝贵，已帮您先记录好当前已确定的信息，您可以直接返回问卷完成剩余提交。',
        updates: [],
        shouldContinue: false,
        metadata: {
          strategyId: 'adaptive',
          stepInfo: '用户偏好极速结束',
        },
      };
    }

    const targetPlugin = StrategyPluginRegistry.get(profile.recommendedStrategy);
    const decision = await targetPlugin.executeStep(ctx);

    return AdaptiveAnswerMapper.decorateDecision(decision, profile.recommendedStrategy);
  }
}
