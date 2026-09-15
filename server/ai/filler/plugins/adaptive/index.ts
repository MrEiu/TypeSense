/**
 * server/ai/filler/plugins/adaptive/index.ts
 *
 * Adaptive Exploration Strategy Plugin entry point.
 */

import type { StrategyPlugin, StrategyManifest, FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { StrategyRouter } from './engine';

export class AdaptiveStrategyPlugin implements StrategyPlugin {
  public manifest: StrategyManifest = {
    id: 'adaptive',
    name: '探索式适配型',
    badge: '🧭 探索式适配',
    description: '全智能策略路由器，根据问卷题型特征与受访者表达风格动态实时派发最佳策略。',
    recommendedFor: ['长篇综合大型问卷', '受访者背景跨度极大的调研', '复合多模块测评'],
    features: ['动态策略路由', '用户表达风格画像', '多策略自适应委派', '智能情绪感知收束'],
  };

  public async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return StrategyRouter.generateOpening(ctx);
  }

  public async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return StrategyRouter.executeStep(ctx);
  }
}
