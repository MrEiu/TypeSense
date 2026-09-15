/**
 * server/ai/filler/plugins/index.ts
 *
 * Registration entry point for all 5 AI speed-filler strategy plugins:
 * 1. natural  - Natural Guidance Strategy
 * 2. deep     - Deep Follow-Up Strategy
 * 3. batch    - Batch Aggregation Strategy
 * 4. evidence - Evidence Priority Strategy
 * 5. adaptive - Adaptive Exploration Strategy
 */

import { StrategyPluginRegistry } from '../core/registry';
import { NaturalStrategyPlugin } from './natural';
import { DeepStrategyPlugin } from './deep';
import { BatchStrategyPlugin } from './batch';
import { EvidenceStrategyPlugin } from './evidence';
import { AdaptiveStrategyPlugin } from './adaptive';

export { NaturalStrategyPlugin } from './natural';
export { DeepStrategyPlugin } from './deep';
export { BatchStrategyPlugin } from './batch';
export { EvidenceStrategyPlugin } from './evidence';
export { AdaptiveStrategyPlugin } from './adaptive';

let pluginsRegistered = false;

/**
 * Register all official strategy plugins into the registry
 */
export function registerAllFillerPlugins(): void {
  if (pluginsRegistered) {
    return;
  }
  StrategyPluginRegistry.register(new NaturalStrategyPlugin());
  StrategyPluginRegistry.register(new DeepStrategyPlugin());
  StrategyPluginRegistry.register(new BatchStrategyPlugin());
  StrategyPluginRegistry.register(new EvidenceStrategyPlugin());
  StrategyPluginRegistry.register(new AdaptiveStrategyPlugin());
  pluginsRegistered = true;
}

// Auto-register default plugins on module load
registerAllFillerPlugins();
