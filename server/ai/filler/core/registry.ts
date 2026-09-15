/**
 * server/ai/filler/core/registry.ts
 *
 * Strategy plugin discovery, registration, and resolution registry.
 */

import type { StrategyPlugin, StrategyType, StrategyManifest } from './types';

export class StrategyPluginRegistry {
  private static plugins: Map<StrategyType, StrategyPlugin> = new Map();
  private static defaultStrategy: StrategyType = 'natural';

  /**
   * Register a strategy plugin instance
   */
  public static register(plugin: StrategyPlugin): void {
    this.plugins.set(plugin.manifest.id, plugin);
  }

  /**
   * Resolve a strategy plugin by id, falling back to default strategy
   */
  public static get(strategyId?: string | null): StrategyPlugin {
    if (strategyId && this.plugins.has(strategyId as StrategyType)) {
      return this.plugins.get(strategyId as StrategyType)!;
    }
    const defaultPlugin = this.plugins.get(this.defaultStrategy);
    if (!defaultPlugin) {
      throw new Error(`[StrategyPluginRegistry] Default strategy "${this.defaultStrategy}" is not registered.`);
    }
    return defaultPlugin;
  }

  /**
   * Check if a strategy is registered
   */
  public static has(strategyId: string): boolean {
    return this.plugins.has(strategyId as StrategyType);
  }

  /**
   * Retrieve all registered strategy manifests
   */
  public static listManifests(): StrategyManifest[] {
    return Array.from(this.plugins.values()).map((p) => p.manifest);
  }

  /**
   * Set default strategy identifier
   */
  public static setDefaultStrategy(id: StrategyType): void {
    this.defaultStrategy = id;
  }
}
