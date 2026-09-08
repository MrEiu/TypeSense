/**
 * server/config-service.ts
 *
 * 模型与系统运行时配置管理服务
 * 核心原则：零预设。不内置任何特定厂商、特定模型名称或默认密钥。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export interface ModelConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export class ConfigService {
  /**
   * 读取当前配置 (优先从 data/config.json，其次兜底环境变量)
   */
  public static getConfig(): ModelConfig {
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          baseURL: parsed.baseURL || process.env.OPENAI_BASE_URL || '',
          apiKey: parsed.apiKey || process.env.OPENAI_API_KEY || '',
          model: parsed.model || process.env.OPENAI_MODEL || '',
        };
      } catch (err) {
        console.warn('[ConfigService] 解析 config.json 失败:', err);
      }
    }

    return {
      baseURL: process.env.OPENAI_BASE_URL || '',
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || '',
    };
  }

  /**
   * 保存配置到 data/config.json
   */
  public static saveConfig(config: Partial<ModelConfig>): ModelConfig {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const current = this.getConfig();
    const updated: ModelConfig = {
      baseURL: config.baseURL !== undefined ? config.baseURL.trim() : current.baseURL,
      apiKey: config.apiKey !== undefined ? config.apiKey.trim() : current.apiKey,
      model: config.model !== undefined ? config.model.trim() : current.model,
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  /**
   * 动态连接服务商接口获取该凭据下的真实可用模型列表
   * 零预设：完全由服务商 /v1/models 接口动态返回
   */
  public static async fetchAvailableModels(credentials?: {
    baseURL?: string;
    apiKey?: string;
  }): Promise<string[]> {
    const current = this.getConfig();
    const baseURL =
      credentials?.baseURL !== undefined && credentials.baseURL.trim() !== ''
        ? credentials.baseURL.trim()
        : current.baseURL;

    let apiKey = credentials?.apiKey?.trim();
    if (!apiKey || apiKey.includes('****')) {
      apiKey = current.apiKey;
    }

    if (!apiKey) {
      throw new Error('未配置 API Key，无法连接服务商获取模型列表。请先配置并保存 API Key。');
    }

    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });

    const response = await client.models.list();
    const modelIds: string[] = [];

    // 兼顾 SDK 的 data 数组与 AsyncIterable
    if (response && Array.isArray((response as any).data)) {
      for (const m of (response as any).data) {
        if (m && m.id) {
          modelIds.push(m.id);
        }
      }
    } else {
      for await (const model of response) {
        if (model && model.id) {
          modelIds.push(model.id);
        }
      }
    }

    // 自然字母序排列
    return modelIds.sort((a, b) => a.localeCompare(b));
  }
}
