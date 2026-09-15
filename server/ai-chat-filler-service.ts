/**
 * server/ai-chat-filler-service.ts
 *
 * AI Conversational Survey Filler Service (Partial Auto-Filler)
 * Responsibilities:
 * 1. Incremental service reusing ConfigService and LlmLogger.
 * 2. Cold-start opening generation based on survey title and overview.
 * 3. Two-stage tool calling: record_extracted_answers decouples updates and continuation decision.
 * 4. Strict server-side validation: verifies question existence, bounds, normalization.
 * 5. Proactive stop principle: extracts high-value answers in 1-2 turns, avoids questionnaire fatigue.
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
  should_continue?: boolean;
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

    const systemPrompt = `你是一个克制、高效且敏锐的问卷【AI 部分自动填写助手】（Partial Auto-Filler）。
受访者正在以自然轻松的方式交流，系统后台对应着一份标准问卷。

【最高核心定位与产品边界】：
1. 你的定位是“部分自动填写器”，绝不追求完成整份问卷，也不把完成率作为目标！
2. 你的任务是通过 1~2 轮轻松自然、低沟通成本的简短交流，帮助受访者提前提取最适合自然语言表达的若干核心答案。
3. 【部分完成即是完全成功】：一份数十题的标准问卷，通过对话仅提取出几道题即可圆满结束，剩余题目全部留给受访者回到标准问卷自主勾选。
4. 严禁把问卷题目按顺序逐条盘问！严禁像考官一样逐题审讯！严禁试图把整份问卷全部聊完！

【通用题型边界过滤原则】：
- 适合通过对话提取的：受访者开放陈述中直接体现的客观事实、核心感受或明确的选择意向；
- 绝对不追问、必须留给受访者在标准问卷自主填写的：需要受访者精确阅读选项长文本、逐项对照、多条目密集打分（如复杂的矩阵量表）、涉及个人身份登记或容易产生误判的精细题目。对这类问题绝对不要发起追问。

【每轮双重独立决策（必须通过调用 record_extracted_answers 工具提交）】：
每轮接收到受访者发言后，你必须独立做出以下两项决策：
决策 A (updates)：
  - 从用户当前发言及上下文中，提取能够明确映射到问卷已有题目的确定答案。
  - 用户说到什么就提取什么；明确多少就填写多少；宁可少填，绝不脑补或主观猜测。
决策 B (should_continue)：
  - 判定是否值得再进行一轮追问（布尔值）：
  - 若用户当前表述已经回答了前面的讨论、或者剩余未答题目并不适合低成本自然追问、或者边际增益低（即需要用户费力回忆或多轮确认），必须坚决将 should_continue 设为 false！
  - 只有当当前存在极其顺畅、低成本、高置信度的一个关键缺口（例如刚才提到的核心情况还差一个最直观的维度，且顺理成章）时，才设为 true；
  - 对话通常在 1~2 轮后即可主动收束。

【交互与回复规范】：
- 严禁脱离问卷主题的无效闲聊（严禁寒暄天气、日常爱好、随便聊聊等）；
- 严禁机械单调的无意义回复（如单纯回复“好的”）；
- 工具调用 record_extracted_answers 专用于提交 updates 与 should_continue 结构化决策。

【答案格式规范（严格遵守）】：
- 单选题 (single_choice)：answer 必须是对应选项的 0-based 整数索引（如 0, 1, 2...），严禁返回选项文字！
- 多选题 (multiple_choice)：answer 必须是命中的选项 0-based 整数索引数组（如 [0, 2]）。
- 问答题 (text_input)：answer 必须是提取出的精炼事实文本。
- 单行量表 (likert_scale 无子维度)：answer 必须是对应档位的 0-based 整数索引。
- 矩阵量表 (likert_scale 含子条目)：answer 格式为 {"0": 1, "1": 3}。仅对用户明确评价的子条目打分，未提及的子条目绝不盲目评分。

=== 问卷题目与当前记录状态 ===
${questionsContext}
`;

    // 3. Define Tool for structured extraction (Pure data extraction, no reply pollution)
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'record_extracted_answers',
          description: '从用户的自然表达中提取能够明确映射到问卷已有题目的标准答案，并决定是否继续追问',
          parameters: {
            type: 'object',
            properties: {
              updates: {
                type: 'array',
                description: '提取出的明确题目答案列表（宁缺毋滥，未提及不填）',
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
              should_continue: {
                type: 'boolean',
                description:
                  '是否继续追问下一轮：true=当前讨论存在极其顺畅、低成本、高置信度的一个自然追问方向；false=已获取到当前交流的有效信息，剩余题目更适合受访者在标准问卷中自主阅题勾选，本次对话应主动收束结束。',
              },
            },
            required: ['updates', 'should_continue'],
          },
        },
      },
    ];

    // Format message history (limit to last 10 messages for token economy)
    const recentMessages = messages.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Stage 1: Call LLM with tool definitions
    const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: ai.model,
      messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    };

    const completion = await LlmLogger.callAndLog(
      'ai-chat-filler-stage1',
      ai,
      createParams,
      { surveyId: survey.id, messageCount: messages.length }
    );

    const choice = completion.choices?.[0];
    if (!choice) {
      throw new Error('LLM 未返回有效内容');
    }

    let reply = choice.message?.content?.trim() || '';
    const rawUpdates: any[] = [];
    let shouldContinue = false;

    // Parse tool calls if any
    const toolCalls = choice.message?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (call.function?.name === 'record_extracted_answers') {
          try {
            const parsedArgs = JSON.parse(call.function.arguments || '{}');
            if (Array.isArray(parsedArgs.updates)) {
              rawUpdates.push(...parsedArgs.updates);
            }
            if (typeof parsedArgs.should_continue === 'boolean') {
              shouldContinue = parsedArgs.should_continue;
            }
          } catch (e) {
            console.warn('[AiChatFiller] Failed to parse tool arguments:', e);
          }
        }
      }
    }

    // 4. Strict System-level validation
    const validUpdates = this.validateAndNormalizeUpdates(survey.questions, rawUpdates);

    // 5. Stage 2: If tool was called, pass tool result back to LLM for coherent natural language reply
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const guidanceText = shouldContinue
        ? '请针对刚才受访者提到的核心情况，进行一句最自然、低沟通成本的简短追问（仅限 1 个问题，严禁连环发问或机械读题干）。'
        : '受访者提供的信息已记录完成。请输出一句简短亲切的收束语，告知已记录刚才提到的情况，并礼貌引导其返回标准问卷完成剩余题目（例如：“好的，刚才提到的情况已经帮您先记录好啦，剩余内容您可以回到问卷继续填写~”），严禁再提任何新问题！';

      const secondTurnMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...recentMessages,
        choice.message, // The assistant message with tool_calls
      ];

      for (const call of toolCalls) {
        secondTurnMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({
            success: true,
            recordedCount: validUpdates.length,
            recordedQuestions: validUpdates.map((u) => ({
              question_id: u.question_id,
              title: u.question_title,
              answer: u.display_text,
            })),
            should_continue: shouldContinue,
            guidance: guidanceText,
          }),
        });
      }

      try {
        const secondCompletion = await LlmLogger.callAndLog(
          'ai-chat-filler-stage2-reply',
          ai,
          {
            model: ai.model,
            messages: secondTurnMessages,
            temperature: 0.4,
          },
          { surveyId: survey.id, stage: 'second_turn_reply', should_continue: shouldContinue }
        );

        const secondReply = secondCompletion.choices?.[0]?.message?.content?.trim();
        if (secondReply) {
          reply = secondReply;
        }
      } catch (err) {
        console.warn('[AiChatFiller] Stage 2 reply generation failed, falling back:', err);
      }
    }

    // Zero-waste safety fallback
    if (!reply.trim()) {
      if (!shouldContinue) {
        if (validUpdates.length > 0) {
          reply = '好的，刚才提到的情况已经帮您先记录好啦，剩余内容您可以回到问卷继续填写~';
        } else {
          reply = '好的，您可以随时返回问卷继续填写~';
        }
      } else {
        if (validUpdates.length > 0) {
          reply = '好的，相关情况已经为你记下。';
        } else {
          reply = '请继续说说您的具体情况~';
        }
      }
    }

    return {
      success: true,
      reply,
      updates: validUpdates,
      should_continue: shouldContinue,
    };
  }

  /**
   * Cold start opening generator
   */
  private static async generateOpeningPrompt(
    ai: { client: OpenAI; model: string },
    survey: QuestionnaireModel
  ): Promise<ChatFillerResponse> {
    const previewQuestions = (survey.questions || [])
      .slice(0, 4)
      .map((q) => q.title)
      .join('、');

    const prompt = `你是一个专业、自然的问卷填写辅助助手（定位：AI 部分自动填写助手）。受访者正准备填写一份问卷。
问卷标题：《${survey.title || '本次调研'}》
问卷说明：${survey.description || '暂无详细描述'}
主要涉及方向：${previewQuestions || '相关情况'}

请生成一句简短、自然、具有明确切入方向的开场问候（1~2 句话）：
1. 欢迎受访者，说明只需简单聊两句大概情况，AI 会协助提取部分信息，无需有答题压力；
2. 结合问卷主题与方向，给出一个最直观轻松的切入点（例如：“你可以先简单说说目前在[...]方面的大致情况，想到什么说什么即可~”）；
3. 严禁机械抛出具体标准题目的序号或完整题干；严禁承诺“会帮你全部填完”。`;

    const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: ai.model,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.5,
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
      `你好！这份问卷主要了解关于「${survey.title}」的情况。你可以先简单说说你的主要情况，我会帮你把涉及的内容先记录好，剩余题目也可以稍后在问卷中查看~`;

    return {
      success: true,
      reply,
      updates: [],
      should_continue: true,
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
