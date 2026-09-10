/**
 * src/services/system-config-service.ts
 *
 * 系统配置服务 (大模型 URL、密钥、模型接口复用)
 * 对应后端 /api/ai/config 与 /api/ai/models 接口
 */

export interface AiSystemConfig {
  baseURL: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  model: string;
}

export class SystemConfigService {
  /**
   * 获取当前大模型系统配置
   */
  public static async getConfig(): Promise<AiSystemConfig> {
    const resp = await fetch('/api/ai/config');
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `获取系统配置失败 (HTTP ${resp.status})`);
    }
    return resp.json();
  }

  /**
   * 保存大模型配置
   */
  public static async saveConfig(data: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  }): Promise<AiSystemConfig> {
    const resp = await fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json.error) {
      throw new Error(json.error || `保存系统配置失败 (HTTP ${resp.status})`);
    }
    return json;
  }

  /**
   * 动态测试并获取服务商可用模型列表
   */
  public static async fetchAvailableModels(data: {
    baseURL?: string;
    apiKey?: string;
  }): Promise<string[]> {
    const resp = await fetch('/api/ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.success) {
      throw new Error(json.error || `获取模型列表失败 (HTTP ${resp.status})`);
    }
    return json.models || [];
  }
}
