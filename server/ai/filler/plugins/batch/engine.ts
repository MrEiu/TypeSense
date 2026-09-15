/**
 * server/ai/filler/plugins/batch/engine.ts
 *
 * Execution engine for Batch Aggregation Strategy.
 * Prompts for multiple related questions concurrently and extracts fields in parallel.
 */

import type OpenAI from 'openai';
import { LlmLogger } from '../../../llm-logger';
import type { FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { BatchContextBuilder } from './context';
import { BatchAnswerMapper } from './mapper';

const BATCH_EXTRACT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'record_batch_answers',
    description: '一次性将用户单句话中包含的多个题目字段批量抽取并记录',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: '从用户一句话中提取到的所有题目字段答案列表（批量提取）',
          items: {
            type: 'object',
            properties: {
              question_id: { type: 'string', description: '题目ID' },
              answer: { description: '单选/量表0-based数字索引，多选为数组，问答为文本' },
              confidence: { type: 'number' },
              evidence: { type: 'string' },
            },
            required: ['question_id', 'answer', 'confidence', 'evidence'],
          },
        },
        missing_fields_summary: {
          type: 'string',
          description: '当前信息包中用户尚未提及的字段简要说明',
        },
        should_continue: {
          type: 'boolean',
          description: '是否继续提问下一组信息包：若重要信息组已收集完毕，应设为 false 结束',
        },
      },
      required: ['updates', 'should_continue'],
    },
  },
};

export class AggregationEngine {
  public static async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, currentAnswers, aiClient } = ctx;
    const { activeBundle, promptContext } = BatchContextBuilder.getActiveBundlePrompt(survey.questions, currentAnswers);

    if (!activeBundle) {
      return {
        type: 'finish',
        reply: '问卷所有信息均已完备，您可以直接返回问卷提交。',
        updates: [],
        shouldContinue: false,
        metadata: { strategyId: 'batch' },
      };
    }

    const fieldNames = activeBundle.questions.map((q) => q.title).join('、');
    const systemPrompt = `你是一位【高效聚合信息采集助手】。
问卷：《${survey.title}》
${promptContext}

【目标】：请直接向受访者打招呼，并在一句话里将这组信息一次性向受访者索取（例如：“您可以一次性告诉我您的【${fieldNames}】~”）。
【红线】：不要单题拆开问！一揽子礼貌清晰表达，控制在 40 字以内。`;

    const resp = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请生成一揽子提问开场。' },
        ],
        temperature: 0.6,
        max_tokens: 120,
      },
      { action: 'batch_opening', surveyId: survey.id }
    );

    const reply = resp.choices[0]?.message?.content?.trim() ||
      `您好！为了节约您的时间，您可以一句话告诉我您的【${fieldNames}】~`;

    return {
      type: 'ask',
      reply,
      updates: [],
      shouldContinue: true,
      metadata: {
        strategyId: 'batch',
        activeBundle: activeBundle.questions.map((q) => q.id),
      },
    };
  }

  public static async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, currentAnswers, messages, aiClient } = ctx;
    const { activeBundle, promptContext } = BatchContextBuilder.getActiveBundlePrompt(survey.questions, currentAnswers);

    const systemPrompt = `你是一位【高效聚合批量速填引擎】。
问卷：《${survey.title}》
${promptContext}

【行为准则】：
1. 用户一句话通常包含多个维度的信息，请调用 record_batch_answers 一次性批量提取所有匹配字段。
2. 即使只说了部分，也优先提取已有部分。若非必填或关键字段已齐，不必反复纠缠，果断将 should_continue 设为 false。
3. 严禁把一个信息包拆成多轮单题盘问！`;

    const recentMessages = messages.slice(-6).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Stage 1: Batch tool call
    const firstCallResp = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
        tools: [BATCH_EXTRACT_TOOL],
        tool_choice: 'auto',
        temperature: 0.2,
      },
      { action: 'batch_stage1_tool_call', surveyId: survey.id }
    );

    const assistantMsg = firstCallResp.choices[0]?.message;
    const toolCalls = assistantMsg?.tool_calls;

    let rawUpdates: any[] = [];
    let shouldContinue = false;
    let missingSummary = '';
    let toolCallId = '';

    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      if (call.function.name === 'record_batch_answers') {
        toolCallId = call.id;
        try {
          const parsed = JSON.parse(call.function.arguments);
          rawUpdates = parsed.updates || [];
          shouldContinue = parsed.should_continue ?? false;
          missingSummary = parsed.missing_fields_summary || '';
        } catch (err) {
          console.error('[AggregationEngine] Parse error:', err);
        }
      }
    }

    const mappedUpdates = BatchAnswerMapper.mapBatchUpdates(rawUpdates);

    // Stage 2: Feedback & acknowledge
    let reply = assistantMsg?.content || '';

    if (toolCallId) {
      const guidance = shouldContinue
        ? `批量记录了 ${mappedUpdates.length} 个字段。请用一句话直接索取下一组未填信息包，不要废话。`
        : `太棒了！一次性批量录入了 ${mappedUpdates.length} 项关键数据。请向用户表示感谢，并告知其剩余题目可以在问卷中直接查看提交，严禁再提任何新问题！`;

      const secondCallResp = await LlmLogger.callAndLog(
        aiClient.client,
        {
          model: aiClient.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...recentMessages,
            assistantMsg as any,
            {
              role: 'tool',
              tool_call_id: toolCallId,
              content: JSON.stringify({ count: mappedUpdates.length, missing: missingSummary, guidance }),
            },
          ],
          temperature: 0.5,
        },
        { action: 'batch_stage2_reply', surveyId: survey.id }
      );

      reply = secondCallResp.choices[0]?.message?.content?.trim() || reply;
    }

    if (!reply) {
      reply = mappedUpdates.length > 0
        ? `已一次性为您填入 ${mappedUpdates.length} 项信息！剩余内容您可以返回问卷继续查看并提交~`
        : '收到您的信息，已帮您同步记录。';
    }

    return {
      type: shouldContinue ? 'ask' : 'finish',
      reply,
      updates: mappedUpdates,
      shouldContinue,
      metadata: {
        strategyId: 'batch',
        activeBundle: activeBundle?.questions.map((q) => q.id),
      },
    };
  }
}
