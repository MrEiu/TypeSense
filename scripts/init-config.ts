/**
 * scripts/init-config.ts
 *
 * 交互式模型初始化命令 (npm run init)
 * 零预设：交互式录入 Base URL 与 API Key，通过 OpenAI SDK 动态拉取模型列表供用户选择，保存至 data/config.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '../data/config.json');

interface ModelConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

function loadConfig(): ModelConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {}
  }
  return { baseURL: '', apiKey: '', model: '' };
}

async function main() {
  const current = loadConfig();

  // 1. 录入 Base URL 与 API Key
  const credentials = await prompts(
    [
      {
        type: 'text',
        name: 'baseURL',
        message: 'Base URL (API 地址，留空使用官方默认):',
        initial: current.baseURL || '',
      },
      {
        type: 'text',
        name: 'apiKey',
        message: 'API Key:',
        initial: current.apiKey || '',
        validate: (v: string) => (v.trim().length > 0 ? true : 'API Key 不能为空'),
      },
    ],
    {
      onCancel: () => {
        console.log('\n已取消初始化');
        process.exit(0);
      },
    }
  );

  const baseURL = credentials.baseURL?.trim() || undefined;
  const apiKey = credentials.apiKey?.trim();

  if (!apiKey) {
    console.log('\n未提供 API Key，已退出');
    process.exit(0);
  }

  // 2. 动态拉取模型列表 (零预设)
  console.log('\n正在连接接口动态获取可用模型列表...');
  const modelList: string[] = [];

  try {
    const client = new OpenAI({ baseURL, apiKey });
    const res = await client.models.list();
    for await (const m of res) {
      if (m?.id) modelList.push(m.id);
    }
    modelList.sort();
  } catch (err: any) {
    console.warn(`⚠️ 拉取模型列表失败: ${err.message}`);
  }

  // 3. 选择或指定模型
  let selectedModel = '';

  if (modelList.length > 0) {
    const defaultIndex = current.model ? modelList.indexOf(current.model) : 0;
    const choice = await prompts(
      {
        type: 'autocomplete',
        name: 'model',
        message: `选择目标模型 (${modelList.length} 个可用，支持输入过滤):`,
        choices: modelList.map((m) => ({ title: m, value: m })),
        initial: defaultIndex >= 0 ? defaultIndex : 0,
      },
      {
        onCancel: () => {
          console.log('\n已取消初始化');
          process.exit(0);
        },
      }
    );
    selectedModel = choice.model || current.model || modelList[0];
  } else {
    const fallback = await prompts(
      {
        type: 'text',
        name: 'model',
        message: '手动输入模型名称:',
        initial: current.model || '',
      },
      {
        onCancel: () => {
          console.log('\n已取消初始化');
          process.exit(0);
        },
      }
    );
    selectedModel = fallback.model || current.model;
  }

  // 4. 保存到 data/config.json
  const finalConfig: ModelConfig = {
    baseURL: credentials.baseURL?.trim() || '',
    apiKey,
    model: selectedModel,
  };

  const dataDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(finalConfig, null, 2), 'utf-8');

  console.log('\n======================================================');
  console.log('✅ 配置已写入 data/config.json');
  console.log(`  Base URL: ${finalConfig.baseURL || '(官方默认)'}`);
  console.log(`  API Key : ${finalConfig.apiKey.slice(0, 4)}****${finalConfig.apiKey.slice(-4)}`);
  console.log(`  Model   : ${finalConfig.model}`);
  console.log('======================================================\n');
}

main().catch(console.error);
