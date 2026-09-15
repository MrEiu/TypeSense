/**
 * server/ai/filler/plugins/deep/index.ts
 *
 * Deep Interview Strategy Plugin entry point.
 */

import type { StrategyPlugin, StrategyManifest, FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { FollowUpEngine } from './engine';

export class DeepStrategyPlugin implements StrategyPlugin {
  public manifest: StrategyManifest = {
    id: 'deep',
    name: '深度追问型',
    badge: '🔍 深度追问',
    description: '深挖高价值因果动因与未言之意，具备最大深度硬熔断，杜绝无休止盘问。',
    recommendedFor: ['深度定性访谈', '用户心理与态度调查', '关键体验痛点溯源', '专家意见调研'],
    features: ['因果链路溯源', '双层深度熔断', '边际收益检测', '深度洞察归纳'],
  };

  public async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return FollowUpEngine.generateOpening(ctx);
  }

  public async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return FollowUpEngine.executeStep(ctx);
  }
}
