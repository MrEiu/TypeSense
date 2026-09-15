/**
 * server/ai/filler/plugins/adaptive/mapper.ts
 *
 * Maps and decorates adaptive strategy decisions with routing metadata.
 */

import type { StrategyDecisionResult, StrategyType } from '../../core/types';

export class AdaptiveAnswerMapper {
  public static decorateDecision(
    decision: StrategyDecisionResult,
    delegatedStrategy: StrategyType
  ): StrategyDecisionResult {
    return {
      ...decision,
      metadata: {
        ...decision.metadata,
        strategyId: 'adaptive',
        delegatedStrategy,
      },
    };
  }
}
