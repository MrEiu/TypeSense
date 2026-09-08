/**
 * registry.ts
 *
 * Pluggable Question Plugin Discovery & Registry
 *
 * Utilizes Vite's `import.meta.glob` to automatically discover and register
 * all question plugins residing in child directories.
 */

import type { QuestionPlugin } from './types';

interface PluginModuleExports {
  default?: QuestionPlugin<any>;
  plugin?: QuestionPlugin<any>;
}

class QuestionPluginRegistry {
  private plugins = new Map<string, QuestionPlugin<any>>();

  public register(plugin: QuestionPlugin<any>): void {
    if (this.plugins.has(plugin.type)) {
      console.warn(`[QuestionRegistry] Overwriting existing question plugin for type: "${plugin.type}"`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  public get(type: string): QuestionPlugin<any> | undefined {
    return this.plugins.get(type);
  }

  public has(type: string): boolean {
    return this.plugins.has(type);
  }

  public list(): QuestionPlugin<any>[] {
    return Array.from(this.plugins.values());
  }
}

export const questionRegistry = new QuestionPluginRegistry();

// Auto-discover and register all plugins in child folders
const pluginModules: Record<string, PluginModuleExports> = import.meta.glob(
  './*/index.ts',
  { eager: true }
);

Object.values(pluginModules).forEach((mod) => {
  const plugin = mod.default || mod.plugin;
  if (plugin && plugin.type) {
    questionRegistry.register(plugin);
  }
});

/**
 * Helper function to retrieve a registered question plugin by type.
 */
export function getQuestionPlugin(type: string): QuestionPlugin<any> | undefined {
  return questionRegistry.get(type);
}

/**
 * Helper function to list all registered plugins.
 */
export function getAllQuestionPlugins(): QuestionPlugin<any>[] {
  return questionRegistry.list();
}

/**
 * Helper function to dynamically register a question plugin at runtime.
 */
export function registerQuestionPlugin(plugin: QuestionPlugin<any>): void {
  questionRegistry.register(plugin);
}

