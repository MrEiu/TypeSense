/**
 * server/ai/filler/plugins/evidence/index.ts
 *
 * Evidence Priority Strategy Plugin entry point.
 */

import type { StrategyPlugin, StrategyManifest, FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { ConfidenceEngine } from './engine';

export class EvidenceStrategyPlugin implements StrategyPlugin {
  public manifest: StrategyManifest = {
    id: 'evidence',
    name: '证据优先型',
    badge: '🛡️ 证据优先',
    description: '严格事实依据驱动，三阶置信度门限（高置信自动填、中置信求证、低置信留白），零幻觉。',
    recommendedFor: ['严肃医疗问诊', '专业合规审计', '严谨学术调查', '高风控数据采集'],
    features: ['事实证据池', '三阶置信度门限', '逐条原话引证', '绝对零脑补幻觉'],
  };

  public async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return ConfidenceEngine.generateOpening(ctx);
  }

  public async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return ConfidenceEngine.executeStep(ctx);
  }
}
