/**
 * server/ai-chat-filler-service.ts
 *
 * AI 自然对话辅助填写服务
 * 职责：
 * 1. 纯增量服务：复用 ConfigService 与 LlmLogger；
 * 2. 破冰引导：首轮 (messages为空) 依据问卷 title 与 description 生成自然开放式开场白；
 * 3. 伴随式抽取：挂载 record_extracted_answers 工具，通过 Tool Calling 分离聊天文本与结构化更新；
 * 4. 系统级合法性校验：严格校验题目存在性、0-based 索引范围、数组去重排序、文本 trim 与量表格式；
 * 5. 极简原则：不推行强制完成、无过度追问、不脑补虚假事实。
 */

import OpenAI from 'openai';
import { ConfigService } from './config-service';
import { LlmLogger } from './llm-logger';
import {
  type QuestionnaireModel,
  type QuestionItemModel,
  type QuestionAnswerMap,
  type QuestionAnswerValue,
  normalizeOptions,
  normalizeStatements,
} from '../src/schema/questionnaire-schema-types';

export interface ExtractedAnswerUpdate {
  question_id: string;
  question_title: string;
  answer: QuestionAnswerValue;
  display_text: string;
  confidence: number;
  evidence: string;
}

export interface ChatFillerRequest {
  survey: QuestionnaireModel;
  currentAnswers: QuestionAnswerMap;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatFillerResponse {
  success: boolean;
  reply: string;
  updates: ExtractedAnswerUpdate[];
}

export class AiChatFillerService {
  /**
   * Helper: Get OpenAI instance from ConfigService
   */
  private static getOpenAI(): { client: OpenAI; model: string } {
    const config = ConfigService.getConfig();
    if (!config.apiKey || !config.model) {
      throw new Error('AI 服务未就绪：缺少 API Key 或 Model 配置。请在系统设置中配置。');
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      timeout: 120000,
      maxRetries: 2,
    });

    return { client, model: config.model };
  }

  /**
   * Main entrypoint: Chat and extract answers
   */
  public static async chatAndExtract(req: ChatFillerRequest): Promise<ChatFillerResponse> {
    const { survey, currentAnswers = {}, messages = [] } = req;
    const ai = this.getOpenAI();

    // 1. Cold start opening prompt (when conversation has not started yet)
    if (messages.length === 0) {
      return this.generateOpeningPrompt(ai, survey);
    }

    // 2. Build question schema summary for LLM context
    const questionsContext = this.buildCompactQuestionsContext(survey.questions, currentAnswers);

    const systemPrompt = `你是一个亲切随和、善于倾听的问卷对话交流助手。
受访者正在以自然聊天的方式与你交流。系统后台对应着一份标准问卷。

你的职责：
1. 【自然倾听与回应】：像朋友一样自然对话，体现共情与交流感。回复要亲切、简短（通常 1~3 句话），不要长篇大论。
2. 【即席抽取（核心）】：从用户的自然表达中，敏锐捕捉能够明确对应到问卷已有题目的事实，并调用工具 record_extracted_answers 写入答案。
3. 【关键铁律】：
   - “用户说到什么，就从中提取什么；明确多少，就填写多少；宁可少填，绝不脑补”。
   - 严禁机械逐题审讯（绝对不要 Q1 → Q2 → Q3 式连环盘问）。
   - 用户没有明确提及或语义模糊的内容，绝对不要凭空猜测答案，不调用工具即可。
   - 若用户修正或反悔之前提供的信息，更新该题的最新值。
   - 允许在发现非常接近明确答案时进行一次轻柔的随口追问（如用户提到“有锻炼”，需要频次时可问“大概一周几次呢？”），若用户未正面回答则直接翻篇，绝不强行纠缠。

4. 【答案格式规范（严格遵守）】：
   - 单选题 (single_choice)：answer 必须是对应选项的 0-based 整数索引（如 0, 1, 2...），严禁返回选项文字！
   - 多选题 (multiple_choice)：answer 必须是命中的选项 0-based 整数索引数组（如 [0, 2]）。
   - 问答题 (text_input)：answer 必须是提取出的精炼事实文本。
   - 单行量表 (likert_scale 无子维度)：answer 必须是对应档位的 0-based 整数索引。
   - 矩阵量表 (likert_scale 含子条目)：answer 格式为 {"0": 1, "1": 3}。仅对用户明确评价的子条目打分，未提及的子条目绝不盲目评分。

=== 问卷题目与当前记录状态 ===
${questionsContext}
`;

    // 3. Define Tool for structured extraction
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'record_extracted_answers',
          description: '从用户的自然表达中提取能够明确映射到问卷已有题目的标准答案',
          parameters: {
            type: 'object',
            properties: {
              updates: {
                type: 'array',
                description: '提取出的明确题目答案列表',
                items: {
                  type: 'object',
                  properties: {
                    question_id: {
                      type: 'string',
                      description: '题目ID，必须是问卷中真实存在的 ID，如 q1, q2',
                    },
                    answer: {
                      description:
                        '单选题为0-based选项数字索引；多选为数字索引数组；问答题为提取文本；单行量表为数字索引',
                    },
                    confidence: {
                      type: 'number',
                      minimum: 0,
                      maximum: 1,
                      description: '抽取可信度 (0~1)',
                    },
                    evidence: {
                      type: 'string',
                      description: '用户本轮或刚才发言中支持该答案的关键原话片段',
                    },
                  },
                  required: ['question_id', 'answer', 'confidence', 'evidence'],
                },
              },
            },
            required: ['updates'],
          },
        },
      },
    ];

    // Format message history (limit to last 10 messages for token economy)
    const recentMessages = messages.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: ai.model,
      messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    };

    const completion = await LlmLogger.callAndLog(
      'ai-chat-filler-turn',
      ai,
      createParams,
      { surveyId: survey.id, messageCount: messages.length }
    );

    const choice = completion.choices?.[0];
    if (!choice) {
      throw new Error('LLM 未返回有效内容');
    }

    let reply = choice.message?.content || '';
    const rawUpdates: any[] = [];

    // Parse tool calls if any
    const toolCalls = choice.message?.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (call.function?.name === 'record_extracted_answers') {
          try {
            const parsedArgs = JSON.parse(call.function.arguments || '{}');
            if (Array.isArray(parsedArgs.updates)) {
              rawUpdates.push(...parsedArgs.updates);
            }
          } catch (e) {
            console.warn('[AiChatFiller] Failed to parse tool arguments:', e);
          }
        }
      }
    }

    // 4. Strict System-level validation
    const validUpdates = this.validateAndNormalizeUpdates(survey.questions, rawUpdates);

    // If reply is empty but updates exist, supply a warm natural confirmation
    if (!reply.trim()) {
      if (validUpdates.length > 0) {
        reply = '好的，相关信息已经帮你记下啦！你可以继续聊聊其他想法，或者随时点击右上角完成。';
      } else {
        reply = '我明白你的意思了，请继续聊聊~';
      }
    }

    return {
      success: true,
      reply,
      updates: validUpdates,
    };
  }

  /**
   * Cold start opening generator
   */
  private static async generateOpeningPrompt(
    ai: { client: OpenAI; model: string },
    survey: QuestionnaireModel
  ): Promise<ChatFillerResponse> {
    const prompt = `你是一个随和亲切的问卷交流助手。用户正准备填写一份问卷。
问卷标题：《${survey.title || '本次调研'}》
问卷说明：${survey.description || '暂无详细描述'}

请生成一句简短、自然、开放式的破冰引言（1~2 句话）：
- 欢迎用户，并围绕问卷主题邀请对方像日常聊天一样随心聊聊相关背景或经历；
- 告知对方不用拘谨，说到哪算哪，随时可以结束；
- 严禁机械抛出第一道标准问题（绝对不要像考官一样问第一题！）。`;

    const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: ai.model,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    };

    const completion = await LlmLogger.callAndLog(
      'ai-chat-filler-opening',
      ai,
      createParams,
      { surveyId: survey.id }
    );

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      `你好！这是一份关于「${survey.title}」的问卷，你可以先随心聊聊你的相关经历或想法，聊到哪算哪，随时可以结束交谈~`;

    return {
      success: true,
      reply,
      updates: [],
    };
  }

  /**
   * Build compact question context for the prompt
   */
  private static buildCompactQuestionsContext(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap
  ): string {
    const lines: string[] = [];

    for (const q of questions) {
      const opts = normalizeOptions(q.options);
      let optStr = '';
      if (opts.length > 0) {
        optStr = ` | 选项: ${opts.map((o, idx) => `[${idx}] ${o.label}`).join(', ')}`;
      }

      const stmts = normalizeStatements(q.statements);
      let stmtStr = '';
      if (stmts.length > 0) {
        stmtStr = ` | 子条目: ${stmts.map((s) => `(${s.id}: ${s.label})`).join(', ')}`;
      }

      // Check current answer status
      const existingVal = currentAnswers[q.id];
      let statusStr = '未记录';
      if (existingVal !== undefined && existingVal !== null && existingVal !== '') {
        if (q.type === 'single_choice' && typeof existingVal === 'number' && opts[existingVal]) {
          statusStr = `已记录: [${existingVal}] ${opts[existingVal].label}`;
        } else if (q.type === 'multiple_choice' && Array.isArray(existingVal)) {
          const selectedLabels = existingVal
            .map((i) => opts[i]?.label)
            .filter(Boolean)
            .join('、');
          statusStr = `已记录: [${existingVal.join(',')}] (${selectedLabels})`;
        } else if (typeof existingVal === 'object') {
          statusStr = `已记录: ${JSON.stringify(existingVal)}`;
        } else {
          statusStr = `已记录: "${existingVal}"`;
        }
      }

      lines.push(`- [${q.id}] (${q.type}) ${q.title}${optStr}${stmtStr} --> 【${statusStr}】`);
    }

    return lines.join('\n');
  }

  /**
   * Strict verification and normalization of candidate updates
   */
  private static validateAndNormalizeUpdates(
    questions: QuestionItemModel[],
    rawUpdates: any[]
  ): ExtractedAnswerUpdate[] {
    const validUpdates: ExtractedAnswerUpdate[] = [];
    const questionMap = new Map<string, QuestionItemModel>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }

    for (const item of rawUpdates) {
      if (!item || typeof item !== 'object') continue;
      const qId = String(item.question_id || '').trim();
      const q = questionMap.get(qId);
      if (!q) continue;

      const opts = normalizeOptions(q.options);
      const stmts = normalizeStatements(q.statements);
      const rawAns = item.answer;

      let validatedAnswer: QuestionAnswerValue = null;
      let displayText = '';

      switch (q.type) {
        case 'single_choice': {
          const idx = Number(rawAns);
          if (Number.isInteger(idx) && idx >= 0 && idx < opts.length) {
            validatedAnswer = idx;
            displayText = opts[idx].label;
          }
          break;
        }

        case 'multiple_choice': {
          if (Array.isArray(rawAns)) {
            // Deduplicate, keep within valid 0-based bounds, sort ascending
            const validIndices = Array.from(
              new Set(
                rawAns
                  .map(Number)
                  .filter((n) => Number.isInteger(n) && n >= 0 && n < opts.length)
              )
            ).sort((a, b) => a - b);

            if (validIndices.length > 0) {
              validatedAnswer = validIndices;
              displayText = validIndices.map((i) => opts[i].label).join('、');
            }
          }
          break;
        }

        case 'text_input': {
          if (rawAns !== undefined && rawAns !== null) {
            const str = String(rawAns).trim();
            if (str.length > 0) {
              validatedAnswer = str;
              displayText = str.length > 30 ? `${str.slice(0, 30)}...` : str;
            }
          }
          break;
        }

        case 'likert_scale': {
          if (stmts.length === 0) {
            // Single row rating
            const idx = Number(rawAns);
            if (Number.isInteger(idx) && idx >= 0 && idx < opts.length) {
              validatedAnswer = idx;
              displayText = opts[idx]?.label || `${idx + 1} 分`;
            }
          } else {
            // Matrix statements rating: must be object mapping statement ID to option index
            if (typeof rawAns === 'object' && rawAns !== null && !Array.isArray(rawAns)) {
              const stmtMap: Record<string, number> = {};
              const displayParts: string[] = [];
              const stmtIdSet = new Set(stmts.map((s) => s.id));

              for (const [sKey, sVal] of Object.entries(rawAns)) {
                if (stmtIdSet.has(sKey)) {
                  const sIdx = Number(sVal);
                  if (Number.isInteger(sIdx) && sIdx >= 0 && sIdx < opts.length) {
                    stmtMap[sKey] = sIdx;
                    const stmtLabel = stmts.find((s) => s.id === sKey)?.label || sKey;
                    const optLabel = opts[sIdx]?.label || `${sIdx + 1}分`;
                    displayParts.push(`${stmtLabel}: ${optLabel}`);
                  }
                }
              }

              if (Object.keys(stmtMap).length > 0) {
                validatedAnswer = stmtMap;
                displayText = displayParts.join('; ');
              }
            }
          }
          break;
        }
      }

      if (validatedAnswer !== null) {
        validUpdates.push({
          question_id: q.id,
          question_title: q.title,
          answer: validatedAnswer,
          display_text: displayText,
          confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.95)),
          evidence: String(item.evidence || '').trim(),
        });
      }
    }

    return validUpdates;
  }
}
