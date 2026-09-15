/**
 * server/ai/filler/plugins/batch/index.ts
 *
 * Batch Aggregation Strategy Plugin entry point.
 */

import type { StrategyPlugin, StrategyManifest, FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { AggregationEngine } from './engine';

export class BatchStrategyPlugin implements StrategyPlugin {
  public manifest: StrategyManifest = {
    id: 'batch',
    name: '高效聚合型',
    badge: '⚡ 高效聚合',
    description: '相关题目成组打包，一次提问多项指标，单句批量抽取多字段。',
    recommendedFor: ['基础信息登记', '企业资质调查', '人口统计', '结构化表单采集'],
    features: ['题目聚类打包', '一揽子提问', '批量多字段抽取', '极简操作轮次'],
  };

  public async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return AggregationEngine.generateOpening(ctx);
  }

  public async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    return AggregationEngine.executeStep(ctx);
  }
}
