/**
 * server/ai/filler/plugins/deep/engine.ts
 *
 * Execution engine for Deep Interview Strategy.
 * Focuses on root-cause elicitation with rigid depth caps and diminishing-return stops.
 */

import type OpenAI from 'openai';
import { LlmLogger } from '../../../llm-logger';
import type { FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { DeepContextBuilder } from './context';
import { DeepAnswerMapper } from './mapper';

const DEEP_INTERVIEW_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'record_deep_interview_answers',
    description: '提取深层动因答案、因果洞察，并决定是否继续追问深度细节',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: '从受访者对话中提取的问卷答案列表',
          items: {
            type: 'object',
            properties: {
              question_id: { type: 'string', description: '题目ID' },
              answer: { description: '单选题/量表0-based索引或问答文本' },
              confidence: { type: 'number' },
              evidence: { type: 'string', description: '受访者原话依据' },
            },
            required: ['question_id', 'answer', 'confidence', 'evidence'],
          },
        },
        insight_summary: {
          type: 'string',
          description: '从受访者多次阐述中提炼出的一句话深层动因/因果本质（如：医生态度满意且解释详细帮助消除疑虑）',
        },
        should_continue: {
          type: 'boolean',
          description: '是否继续深挖该话题：若因果链路已闭环、或信息增益边际递减，务必为 false',
        },
      },
      required: ['updates', 'should_continue'],
    },
  },
};

export class FollowUpEngine {
  public static async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, aiClient } = ctx;
    const systemPrompt = `你是一位专业、富有同理心的深度定性访谈研究员。
正在针对问卷《${survey.title}》展开关键动因调研。
【目标】：请用亲切、真诚的语气向受访者问候，并邀请对方分享一件对《${survey.title}》印象最深、体验最显著的具体经历或故事。
【约束】：控制在 45 字以内，严禁读题列选项。`;

    const resp = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请开始深度访谈开场。' },
        ],
        temperature: 0.7,
        max_tokens: 150,
      },
      { action: 'deep_opening', surveyId: survey.id }
    );

    const reply = resp.choices[0]?.message?.content?.trim() ||
      `您好！关于《${survey.title}》，很想听听您印象最深的一次具体经历，当时有什么细节让您特别触动吗？`;

    return {
      type: 'ask',
      reply,
      updates: [],
      shouldContinue: true,
      metadata: { strategyId: 'deep', followUpDepth: 0 },
    };
  }

  public static async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, currentAnswers, messages, aiClient } = ctx;
    const followUpState = DeepContextBuilder.evaluateFollowUpState(messages);
    const questionsContext = DeepContextBuilder.buildPromptContext(survey.questions, currentAnswers, followUpState);

    // Hard cutoff if max depth exceeded or user shows exhaustion
    const forceStop = followUpState.depth >= followUpState.maxDepth || followUpState.isRepetitiveOrVague;

    const systemPrompt = `你是一位【AI 深度追问型访谈专家】。
问卷：《${survey.title}》
${questionsContext}

【追问与停止原则】：
1. 目的：挖掘用户体验背后的深层原因、因果链路（现状 -> 触动点 -> 根本原因），而不是泛泛聊天。
2. 熔断机制：
   - 当前追问深度: ${followUpState.depth} (上限 ${followUpState.maxDepth})；
   - ${forceStop ? '★已触发最大深度或信息增益递减熔断，本次必须将 should_continue 设为 false★' : '可围绕关键痛点/动因提出一个直击本质的深度追问'}；
3. 你必须调用工具 record_deep_interview_answers 提交抽取数据与决策。`;

    const recentMessages = messages.slice(-8).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Stage 1: Tool Call
    const firstCallResp = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
        tools: [DEEP_INTERVIEW_TOOL],
        tool_choice: 'auto',
        temperature: 0.25,
      },
      { action: 'deep_stage1_tool_call', surveyId: survey.id }
    );

    const assistantMsg = firstCallResp.choices[0]?.message;
    const toolCalls = assistantMsg?.tool_calls;

    let updates: any[] = [];
    let shouldContinue = false;
    let insightSummary = '';
    let toolCallId = '';

    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      if (call.function.name === 'record_deep_interview_answers') {
        toolCallId = call.id;
        try {
          const parsed = JSON.parse(call.function.arguments);
          updates = parsed.updates || [];
          shouldContinue = forceStop ? false : (parsed.should_continue ?? false);
          insightSummary = parsed.insight_summary || '';
        } catch (err) {
          console.error('[FollowUpEngine] Tool arg parse error:', err);
        }
      }
    }

    const mappedUpdates = DeepAnswerMapper.mapToolUpdates(updates, insightSummary);

    // Stage 2: Synthesis & Next Question or Finish
    let reply = assistantMsg?.content || '';

    if (toolCallId) {
      const guidance = shouldContinue
        ? '答案已记录。请根据用户刚才的核心表述，提出唯一一个深挖因果或价值影响的最关键追问。'
        : `答案已记录。已提炼深层动因【${insightSummary || '核心体验明确'}】。请用一段温润感激的话对用户的深度分享表示感谢，并引导其返回标准问卷完成剩余客观题填写，严禁再提任何新问题！`;

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
              content: JSON.stringify({ recorded: mappedUpdates.length, insight: insightSummary, guidance }),
            },
          ],
          temperature: 0.5,
        },
        { action: 'deep_stage2_reply', surveyId: survey.id }
      );

      reply = secondCallResp.choices[0]?.message?.content?.trim() || reply;
    }

    if (!reply) {
      reply = shouldContinue
        ? '这个细节非常关键，能再具体聊聊它对您后续决策产生了怎样的影响吗？'
        : '非常感谢您深入详尽的分享！这些核心动因已经帮您记录好了，剩余客观题目您可以返回问卷继续勾选~';
    }

    return {
      type: shouldContinue ? 'ask' : 'finish',
      reply,
      updates: mappedUpdates,
      shouldContinue,
      metadata: {
        strategyId: 'deep',
        followUpDepth: followUpState.depth,
        stepInfo: insightSummary ? `提炼洞察: ${insightSummary}` : undefined,
      },
    };
  }
}
