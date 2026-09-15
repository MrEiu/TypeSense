/**
 * server/ai/filler/plugins/natural/index.ts
 *
 * Natural Guidance Strategy Plugin entry point.
 */

import type { StrategyPlugin, StrategyManifest, FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { GuidanceEngine } from './engine';

export class NaturalStrategyPlugin implements StrategyPlugin {
  public manifest: StrategyManifest = {
    id: 'natural',
    name: '自然引导型',
    badge: '🍃 自然引导',
    description: '围绕调研目标自然交流，无需机械读题，获知关键点后即刻收束。',
    recommendedFor: ['用户体验评价', '服务满意度', '开放性反馈', '日常体验调研'],
    features: ['目标驱动', '零机械报题', '及早收束', '无完成率负担'],
  };

  public async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return GuidanceEngine.generateOpening(ctx);
  }

  public async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return GuidanceEngine.executeStep(ctx);
  }
}
