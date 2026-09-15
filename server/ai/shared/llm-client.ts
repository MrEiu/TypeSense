/**
 * server/ai/shared/llm-client.ts
 *
 * Factory and configuration loader for OpenAI API client instances.
 */

import OpenAI from 'openai';
import { ConfigService } from '../../config-service';
import { AiConfigurationError } from './errors';

export interface LlmClientContext {
  client: OpenAI;
  model: string;
}

export class LlmClientFactory {
  /**
   * Acquire initialized OpenAI client and active model name.
   * Throws AiConfigurationError if credentials are not configured.
   */
  public static getClient(timeoutMs: number = 600000, maxRetries: number = 2): LlmClientContext {
    const config = ConfigService.getConfig();
    if (!config.apiKey || !config.model) {
      throw new AiConfigurationError(
        'AI 模型未配置或 API 密钥缺失。请先在控制台右上角「设置」中配置有效的 API Key 与 Model 名称。'
      );
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      timeout: timeoutMs,
      maxRetries,
    });

    return { client, model: config.model };
  }
}
