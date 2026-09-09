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
    metadata?: Record<string, any>
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const startTime = Date.now();
    const messages = (createParams.messages || []).map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    try {
      const response = await ai.client.chat.completions.create(createParams);
      const durationMs = Date.now() - startTime;
      const rawOutput = response.choices[0]?.message?.content || '';

      this.appendLog({
        action,
        model: createParams.model || ai.model,
        messages,
        responseRaw: rawOutput,
        durationMs,
        metadata,
      });

      return response;
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
