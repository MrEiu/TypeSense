/**
 * server/ai/filler/decision-engine.ts
 *
 * Two-stage decision engine and answer validation for the conversational auto-filler.
 */

import type OpenAI from 'openai';
import {
  type QuestionItemModel,
  type QuestionAnswerValue,
  normalizeOptions,
  normalizeStatements,
} from '../../../src/schema/questionnaire-schema-types';
import { LlmLogger } from '../../llm-logger';

export interface ExtractedAnswerUpdate {
  question_id: string;
  question_title: string;
  answer: QuestionAnswerValue;
  display_text: string;
  confidence: number;
  evidence: string;
}

export const RECORD_ANSWERS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
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
};

export class FillerDecisionEngine {
  /**
   * Strict verification and normalization of candidate updates
   */
  public static validateAndNormalizeUpdates(
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
            const idx = Number(rawAns);
            if (Number.isInteger(idx) && idx >= 0 && idx < opts.length) {
              validatedAnswer = idx;
              displayText = opts[idx]?.label || `${idx + 1} 分`;
            }
          } else {
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

  /**
   * Execute two-stage tool-calling chat flow
   */
  public static async executeTwoStageChat(params: {
    ai: { client: OpenAI; model: string };
    surveyId: string;
    questions: QuestionItemModel[];
    systemPrompt: string;
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<{ reply: string; updates: ExtractedAnswerUpdate[]; shouldContinue: boolean }> {
    const { ai, surveyId, questions, systemPrompt, recentMessages } = params;

    // Stage 1: Call LLM with tool definitions
    const stage1Params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: ai.model,
      messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
      tools: [RECORD_ANSWERS_TOOL],
      tool_choice: 'auto',
      temperature: 0.3,
    };

    const completion = await LlmLogger.callAndLog(
      'ai-chat-filler-stage1',
      ai,
      stage1Params,
      { surveyId, messageCount: recentMessages.length }
    );

    const choice = completion.choices?.[0];
    if (!choice) {
      throw new Error('LLM 未返回有效内容');
    }

    let reply = choice.message?.content?.trim() || '';
    const rawUpdates: any[] = [];
    let shouldContinue = false;

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
            console.warn('[FillerDecisionEngine] Failed to parse tool arguments:', e);
          }
        }
      }
    }

    const validUpdates = this.validateAndNormalizeUpdates(questions, rawUpdates);

    // Stage 2: Return tool results to LLM for final natural response
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const guidanceText = shouldContinue
        ? '请针对刚才受访者提到的核心情况，进行一句最自然、低沟通成本的简短追问（仅限 1 个问题，严禁连环发问或机械读题干）。'
        : '受访者提供的信息已记录完成。请输出一句简短亲切的收束语，告知已记录刚才提到的情况，并礼貌引导其返回标准问卷完成剩余题目（例如：“好的，刚才提到的情况已经帮您先记录好啦，剩余内容您可以回到问卷继续填写~”），严禁再提任何新问题！';

      const secondTurnMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...recentMessages,
        choice.message,
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
          { surveyId, stage: 'second_turn_reply', should_continue: shouldContinue }
        );

        const secondReply = secondCompletion.choices?.[0]?.message?.content?.trim();
        if (secondReply) {
          reply = secondReply;
        }
      } catch (err) {
        console.warn('[FillerDecisionEngine] Stage 2 reply generation failed, falling back:', err);
      }
    }

    // Safety fallback
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
      reply,
      updates: validUpdates,
      shouldContinue,
    };
  }
}
