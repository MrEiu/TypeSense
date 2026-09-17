/**
 * server/ai/filler/plugins/evidence/engine.ts
 *
 * Execution engine for Evidence Priority Strategy.
 * Matches user statements against questions with strict confidence gates.
 */

import type OpenAI from 'openai';
import { LlmLogger } from '../../../../llm-logger';
import type { FillerExecutionContext, StrategyDecisionResult } from '../../core/types';
import { EvidenceContextBuilder } from './context';
import { EvidenceAnswerMapper } from './mapper';

const EVALUATE_EVIDENCE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'evaluate_evidence_and_decide',
    description: '对比用户发言中的事实原话，计算匹配置信度，绝对严禁无凭据脑补推断',
    parameters: {
      type: 'object',
      properties: {
        matches: {
          type: 'array',
          description: '与用户原话证据相匹配的题目答案项',
          items: {
            type: 'object',
            properties: {
              question_id: { type: 'string' },
              answer: { description: '严格根据原话能明确对应的值' },
              confidence: {
                type: 'number',
                description: '置信度(0.0~1.0)：确凿无误>=0.85；疑似/推测0.60~0.84；凭空猜测<0.60',
              },
              evidence: {
                type: 'string',
                description: '必须是用户原话中直接支持该结论的准确句子片段，绝不能无中生有',
              },
            },
            required: ['question_id', 'answer', 'confidence', 'evidence'],
          },
        },
        should_continue: {
          type: 'boolean',
          description: '是否继续核验：若已有证据提取完毕且剩余题目需用户手动精准作答，设为 false',
        },
      },
      required: ['matches', 'should_continue'],
    },
  },
};

export class ConfidenceEngine {
  public static async generateOpening(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, aiClient } = ctx;
    const systemPrompt = `你是一位严谨客观的【证据优先型调研助手】。
协助受访者参与问卷：《${survey.title}》。
【原则】：
请简短告知受访者：本次对话将严格根据受访者的亲身陈述进行客观核验记录，绝不会主观臆测任何答案。
请向受访者礼貌问候，并邀请其自由陈述与《${survey.title}》相关的已知真实情况。
控制在 45 字以内，不念题，不列选项。`;

    const resp = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请开始证据优先开场。' },
        ],
        temperature: 0.3,
        max_tokens: 130,
      },
      { action: 'evidence_opening', surveyId: survey.id }
    );

    const reply = resp.choices[0]?.message?.content?.trim() ||
      `您好！关于《${survey.title}》，请您自由陈述您的真实情况与经历，系统将仅依据您的原话客观记录，绝不主观推断。`;

    return {
      type: 'ask',
      reply,
      updates: [],
      shouldContinue: true,
      metadata: { strategyId: 'evidence' },
    };
  }

  public static async executeStep(ctx: FillerExecutionContext): Promise<StrategyDecisionResult> {
    const { survey, currentAnswers, messages, aiClient } = ctx;
    const ledger = EvidenceContextBuilder.buildEvidenceLedger(messages);
    const questionsContext = EvidenceContextBuilder.buildPromptContext(survey.questions, currentAnswers, ledger);

    const systemPrompt = `你是一位【证据优先型核验审计引擎】。
问卷：《${survey.title}》
${questionsContext}

【严苛纪律与置信度门限】：
1. 绝对零脑补：严禁过度联想！例如用户说“身体不舒服”，绝对不能推定其得了某种具体疾病；
2. 置信度判断：
   - >= 0.85: 用户原话明确、唯一、确定地指定了该答案；
   - 0.60 ~ 0.84: 用户原话有相关倾向，但存在微小歧义；
   - < 0.60: 缺乏依据或完全未提及，严禁编造！
3. 必须调用工具 evaluate_evidence_and_decide 提交核验匹配结果。`;

    const recentMessages = messages.slice(-8).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Stage 1: Evidence Evaluation
    const firstCallResp = await LlmLogger.callAndLog(
      aiClient.client,
      {
        model: aiClient.model,
        messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
        tools: [EVALUATE_EVIDENCE_TOOL],
        tool_choice: 'auto',
        temperature: 0.1,
      },
      { action: 'evidence_stage1_tool_call', surveyId: survey.id }
    );

    const assistantMsg = firstCallResp.choices[0]?.message;
    const toolCalls = assistantMsg?.tool_calls;

    let matches: any[] = [];
    let shouldContinue = false;
    let toolCallId = '';

    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      if (call.function.name === 'evaluate_evidence_and_decide') {
        toolCallId = call.id;
        try {
          const parsed = JSON.parse(call.function.arguments);
          matches = parsed.matches || [];
          shouldContinue = parsed.should_continue ?? false;
        } catch (err) {
          console.error('[ConfidenceEngine] Parse error:', err);
        }
      }
    }

    const highConfidenceUpdates = EvidenceAnswerMapper.mapHighConfidenceUpdates(matches);
    const confirmationCandidates = EvidenceAnswerMapper.extractConfirmationCandidates(matches);

    // If moderate confidence candidate exists, prioritize a confirmation question
    const needsConfirm = confirmationCandidates.length > 0 && highConfidenceUpdates.length === 0;
    const actionType = needsConfirm ? 'confirm' : (shouldContinue ? 'ask' : 'finish');

    // Stage 2: Feedback & Reply
    let reply = assistantMsg?.content || '';

    if (toolCallId) {
      let guidance = '';
      if (needsConfirm) {
        const candidate = confirmationCandidates[0];
        guidance = `原话证据【${candidate.evidence}】置信度为中等。请用最礼貌客观的一句话向用户核对求证（如：“根据您提到的‘${candidate.evidence}’，请问是否可以为您记录为【${candidate.display_text}】呢？”），不要直接定论。`;
      } else if (shouldContinue) {
        guidance = `已基于确凿证据记录 ${highConfidenceUpdates.length} 条答案。请针对下一个未有事实依据的维度发起一个简要核验询问。`;
      } else {
        guidance = `已基于确凿证据记录 ${highConfidenceUpdates.length} 条客观答案。请向用户致谢，并告知未提及的专业题目建议返回问卷中亲自核验勾选，绝不擅自揣测，收束交谈！`;
      }

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
              content: JSON.stringify({
                high_conf_count: highConfidenceUpdates.length,
                confirm_count: confirmationCandidates.length,
                guidance,
              }),
            },
          ],
          temperature: 0.3,
        },
        { action: 'evidence_stage2_reply', surveyId: survey.id }
      );

      reply = secondCallResp.choices[0]?.message?.content?.trim() || reply;
    }

    if (!reply) {
      reply = highConfidenceUpdates.length > 0
        ? `已严格依据您的原话记录了 ${highConfidenceUpdates.length} 条有据可查的信息，其余未提及的内容您可以回到问卷亲自核对勾选。`
        : '收到，系统已核实您提供的情况。';
    }

    return {
      type: actionType,
      reply,
      updates: highConfidenceUpdates,
      shouldContinue: needsConfirm ? true : shouldContinue,
      metadata: {
        strategyId: 'evidence',
        confidenceSummary: Object.fromEntries(highConfidenceUpdates.map((u) => [u.question_id, u.confidence])),
        evidenceSnippet: Object.fromEntries(highConfidenceUpdates.map((u) => [u.question_id, u.evidence || ''])),
      },
    };
  }
}
