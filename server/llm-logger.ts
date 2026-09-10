/**
 * server/llm-logger.ts
 *
 * LLM 输入输出动态交互记录工具 (LLM Interaction Logger)
 *
 * 职责：
 * 1. 自动截获传给 LLM 的请求内容（System Prompt、User Prompt、参数）与 LLM 原始返回内容；
 * 2. 统计单次推理耗时与状态；
 * 3. 动态追加写入 data/llm-logs.md（直观 Markdown 格式，便于随时在 IDE 或编辑器中查看审查）；
 * 4. 零入侵设计：通过 callAndLog 统一包装 OpenAI 调用，发生文件写入异常时不干扰主生成链路。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const LOGS_FILE_PATH = path.resolve(__dirname, '../data/llm-logs.md');

export interface LlmLogEntry {
  action: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  responseRaw?: string;
  durationMs: number;
  error?: string;
  metadata?: Record<string, any>;
}

export class LlmLogger {
  /**
   * 包装 OpenAI Completion 调用，自动计时并记录请求与响应日志
   */
  public static async callAndLog(
    action: string,
    ai: { client: OpenAI; model: string },
    createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    metadata?: Record<string, any>,
    streamCallbacks?: {
      onThought?: (delta: string) => void;
      onContent?: (delta: string) => void;
    }
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const startTime = Date.now();
    const messages = (createParams.messages || []).map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    try {
      let rawOutput = '';
      let inThinkTag = false;

      try {
        // 优先采用底层流式接收 (stream: true) 并实时收集 Token 分块，
        // 彻底解决大问卷推理长耗时 (>60s) 时 Node.js undici / 网络代理 60 秒空闲超时终止 (TypeError: terminated / SocketError: other side closed)
        const stream = await ai.client.chat.completions.create({
          ...createParams,
          stream: true,
        });

        for await (const chunk of stream) {
          const deltaObj = (chunk.choices[0]?.delta as any) || {};
          const reasoningDelta = deltaObj.reasoning_content || '';
          const contentDelta = deltaObj.content || '';

          // 1. 标准 reasoning_content 字段 (DeepSeek-R1 / SiliconFlow / OpenAI 兼容推理接口)
          if (reasoningDelta) {
            streamCallbacks?.onThought?.(reasoningDelta);
          }

          // 2. 内联 <think>...</think> 标签解析支持 (Ollama / 开源权重格式)
          if (contentDelta) {
            let remaining = contentDelta;

            if (!inThinkTag && remaining.includes('<think>')) {
              const parts = remaining.split('<think>');
              if (parts[0]) {
                rawOutput += parts[0];
                streamCallbacks?.onContent?.(parts[0]);
              }
              inThinkTag = true;
              remaining = parts.slice(1).join('<think>');
            }

            if (inThinkTag) {
              if (remaining.includes('</think>')) {
                const parts = remaining.split('</think>');
                if (parts[0]) {
                  streamCallbacks?.onThought?.(parts[0]);
                }
                inThinkTag = false;
                const afterThink = parts.slice(1).join('</think>');
                if (afterThink) {
                  rawOutput += afterThink;
                  streamCallbacks?.onContent?.(afterThink);
                }
              } else {
                streamCallbacks?.onThought?.(remaining);
              }
            } else {
              rawOutput += remaining;
              streamCallbacks?.onContent?.(remaining);
            }
          }
        }
      } catch (streamErr: any) {
        // 若目标第三方接口不兼容 stream: true，则自动降级回退至常规请求
        if (rawOutput.length === 0) {
          console.warn(`[LlmLogger] 流式模式失败，正在降级尝试非流式请求:`, streamErr.message);
          const fallbackRes = await ai.client.chat.completions.create(createParams);
          rawOutput = fallbackRes.choices[0]?.message?.content || '';
        } else {
          throw streamErr;
        }
      }

      const durationMs = Date.now() - startTime;

      this.appendLog({
        action,
        model: createParams.model || ai.model,
        messages,
        responseRaw: rawOutput,
        durationMs,
        metadata,
      });

      // 构造标准 ChatCompletion 结果返回给上层业务，零侵入无缝兼容
      const syntheticResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: `chatcmpl_stream_${Date.now()}`,
        created: Math.floor(Date.now() / 1000),
        model: createParams.model || ai.model,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: rawOutput,
              refusal: null,
            },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
      };

      return syntheticResponse;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.appendLog({
        action,
        model: createParams.model || ai.model,
        messages,
        durationMs,
        error: err?.message || String(err),
        metadata,
      });
      throw err;
    }
  }

  /**
   * 将单次交互以结构化 Markdown 形式追加至日志文件
   */
  public static appendLog(entry: LlmLogEntry): void {
    try {
      const logDir = path.dirname(LOGS_FILE_PATH);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
      const statusBadge = entry.error ? '❌ 异常失败' : '✅ 成功响应';

      const formattedMessages = entry.messages
        .map(
          (m) =>
            `#### 💬 [${m.role.toUpperCase()}]\n\`\`\`text\n${m.content}\n\`\`\``
        )
        .join('\n\n');

      const responseBlock = entry.error
        ? `#### ⚠️ 错误详情\n\`\`\`text\n${entry.error}\n\`\`\``
        : `#### 🤖 LLM 原始返回\n\`\`\`json\n${entry.responseRaw || '(空返回)'}\n\`\`\``;

      const metaBlock = entry.metadata
        ? `\n- **附加元信息**: \`${JSON.stringify(entry.metadata)}\``
        : '';

      const logBlock = `
## [${timestamp}] ${entry.action} (${statusBadge})

- **模型**: \`${entry.model}\`
- **耗时**: \`${entry.durationMs} ms\`${metaBlock}

### 📥 传给 LLM 的请求内容
${formattedMessages}

### 📤 LLM 产出内容
${responseBlock}

---
`;

      // 若文件不存在，写入文件头
      if (!fs.existsSync(LOGS_FILE_PATH)) {
        const header = `# TypeSense LLM 交互链路审计日志\n> 自动记录系统所有发送给大模型的 Prompt 内容与大模型的完整原始响应。\n\n---\n`;
        fs.writeFileSync(LOGS_FILE_PATH, header + logBlock, 'utf-8');
      } else {
        fs.appendFileSync(LOGS_FILE_PATH, logBlock, 'utf-8');
      }
    } catch (logErr) {
      // 日志记录失败静默警告，绝不阻断正常业务流程
      console.warn('[LlmLogger] 写入 LLM 日志异常:', logErr);
    }
  }

  /**
   * 获取日志文件存储路径
   */
  public static getLogFilePath(): string {
    return LOGS_FILE_PATH;
  }
}
