/**
 * server/ai/filler/plugins/natural/engine.ts
 *
 * Execution engine for Natural Guidance Strategy.
 * Executes natural opening generation and two-stage tool-calling dialogue loops.
 */

import type OpenAI from 'openai';
import { LlmLogger } from '../../../llm-logger';
import type { FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { NaturalContextBuilder } from './context';
import { NaturalAnswerMapper } from './mapper';

const RECORD_ANSWERS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
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
              question_id: { type: 'string', description: '题目ID，如 q1, q2' },
              answer: { description: '单选/量表为0-based索引；多选为索引数组；问答为文本' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              evidence: { type: 'string', description: '支持该答案的用户原话片段' },
            },
            required: ['question_id', 'answer', 'confidence', 'evidence'],
          },
        },
        should_continue: {
          type: 'boolean',
          description: '是否继续追问：true=存在极其顺畅自然的一个延伸追问；false=关键信息已获得或剩余题目适合受访者自己勾选，应主动收束结束。',
        },
      },
      required: ['updates', 'should_continue'],
    },
  },
};

export class GuidanceEngine {
  /**
   * Generates opening welcome prompt
   */
  public static async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, aiClient } = ctx;
    const questionsContext = NaturalContextBuilder.buildPromptContext(survey.questions, {});

    const systemPrompt = `你是一位亲切温和的调研交流助手。
你正在协助受访者填写问卷：《${survey.title}》。
说明：${survey.description || '暂无详细描述'}

【目标】：
请用 1~2 句极其简短、亲切自然的话向受访者打招呼，并抛出第一个开放式破冰话题（例如：“您好呀！关于${survey.title}，您可以先跟我简单聊聊您最直观的体验或看法~”）。
【绝对红线】：
1. 严禁向用户逐条读题，严禁列出选项 A/B/C/D；
2. 语言简明、温润，字数控制在 40 字以内。`;

    const response = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请开始问候并开启第一个交流话题。以下是问卷参考：\n${questionsContext}` },
        ],
        temperature: 0.7,
        max_tokens: 150,
      },
      { action: 'natural_opening', surveyId: survey.id }
    );

    const reply = response.choices[0]?.message?.content?.trim() ||
      `您好！关于《${survey.title}》，您可以先随意聊聊您的整体体验或印象最深的事~`;

    return {
      type: 'ask',
      reply,
      updates: [],
      shouldContinue: true,
      metadata: { strategyId: 'natural' },
    };
  }

  /**
   * Two-stage chat decision loop
   */
  public static async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, currentAnswers, messages, aiClient } = ctx;
    const questionsContext = NaturalContextBuilder.buildPromptContext(survey.questions, currentAnswers);

    const systemPrompt = `你是一位【AI 部分自动填写器】（自然引导模式）。
问卷名称：《${survey.title}》
${questionsContext}

【核心行为准则】：
1. 目标定位：通过与用户的日常自然交谈，自动提炼出可以明确填入问卷的答案。部分完成即是完全成功！获取到有价值的信息即可结束，绝不追求整份问卷必须全部聊完。
2. 决策与工具：每一轮用户回答后，你必须调用工具 record_extracted_answers 提交提取出的答案以及 should_continue 决策。
3. 停止策略（should_continue = false）：
   - 如果用户表达已经覆盖了最顺畅的几个要点；
   - 或者剩余题目更适合在标准问卷中让用户自主阅读勾选；
   - 务必将 should_continue 设为 false，果断进入收束。`;

    const recentMessages = messages.slice(-8).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Stage 1: Invoke LLM with tool
    const firstCallResp = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
        tools: [RECORD_ANSWERS_TOOL],
        tool_choice: 'auto',
        temperature: 0.3,
      },
      { action: 'natural_stage1_tool_call', surveyId: survey.id }
    );

    const assistantMsg = firstCallResp.choices[0]?.message;
    const toolCalls = assistantMsg?.tool_calls;

    let updates: any[] = [];
    let shouldContinue = false;
    let toolCallId = '';

    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      if (call.function.name === 'record_extracted_answers') {
        toolCallId = call.id;
        try {
          const parsed = JSON.parse(call.function.arguments);
          updates = parsed.updates || [];
          shouldContinue = parsed.should_continue ?? false;
        } catch (err) {
          console.error('[GuidanceEngine] Tool argument parse error:', err);
        }
      }
    }

    const mappedUpdates = NaturalAnswerMapper.mapToolUpdates(updates);

    // Stage 2: Feed back result to generate considerate reply
    let reply = assistantMsg?.content || '';

    if (toolCallId) {
      const guidance = shouldContinue
        ? '答案已记录。请针对尚未获知的要点提出唯一一个最自然、低成本的简短追问（不可按顺序读题）。'
        : '答案已记录。关键信息已经很丰富，请直接向用户表示感谢并引导其返回标准问卷完成剩余勾选，严禁再提任何新问题！';

      const toolResultContent = JSON.stringify({
        recorded_count: mappedUpdates.length,
        guidance,
      });

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
              content: toolResultContent,
            },
          ],
          temperature: 0.6,
        },
        { action: 'natural_stage2_reply', surveyId: survey.id }
      );

      reply = secondCallResp.choices[0]?.message?.content?.trim() || reply;
    }

    if (!reply) {
      reply = mappedUpdates.length > 0
        ? '好的，您刚才提到的信息已经先帮您记录下来啦！剩余题目您可以回到问卷继续勾选~'
        : '明白您的意思啦，您可以继续跟我聊聊，或者返回问卷继续勾选。';
    }

    return {
      type: shouldContinue ? 'ask' : 'finish',
      reply,
      updates: mappedUpdates,
      shouldContinue,
      metadata: { strategyId: 'natural' },
    };
  }
}
