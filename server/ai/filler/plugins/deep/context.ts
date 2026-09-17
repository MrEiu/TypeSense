/**
 * server/ai/filler/plugins/deep/context.ts
 *
 * Context builder for Deep Interview Strategy.
 * Tracks drill-down thread depth, detects semantic information density,
 * and maintains causal chain state.
 */

import type { QuestionItemModel, QuestionAnswerMap } from '../../../../../src/schema/questionnaire-schema-types';

export interface DeepFollowUpState {
  currentTopic: string;
  depth: number;
  maxDepth: number;
  isRepetitiveOrVague: boolean;
}

export class DeepContextBuilder {
  public static readonly MAX_DEPTH = 2;

  /**
   * Evaluates depth and detects if user reply is brief or exhausted
   */
  public static evaluateFollowUpState(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): DeepFollowUpState {
    const userMessages = messages.filter((m) => m.role === 'user');
    const depth = userMessages.length;

    // Check if the latest user response is very short or dismissive
    const latestUserMsg = userMessages[userMessages.length - 1]?.content?.trim() || '';
    const isBrief = latestUserMsg.length > 0 && latestUserMsg.length < 6;
    const isVague = /^(还可以|还行|随便|没什么|差不多|一般|不知道|没有)$/.test(latestUserMsg);

    return {
      currentTopic: 'core_experience_causality',
      depth,
      maxDepth: this.MAX_DEPTH,
      isRepetitiveOrVague: isBrief || isVague,
    };
  }

  /**
   * Builds prompt context for deep exploration
   */
  public static buildPromptContext(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap,
    state: DeepFollowUpState
  ): string {
    const unanswered = questions.filter(
      (q) => currentAnswers[q.id] === undefined || currentAnswers[q.id] === null || currentAnswers[q.id] === ''
    );

    let ctx = `【深度追问状态】\n`;
    ctx += `- 当前深度: 第 ${state.depth} 轮 (硬上限: ${state.maxDepth} 轮)\n`;
    ctx += `- 用户表达活跃度: ${state.isRepetitiveOrVague ? '偏低/趋于收敛' : '充实'}\n`;
    ctx += `待深挖的核心题目清单（挑出最具定性价值的题目深入，绝不逐题朗读）：\n`;

    unanswered.slice(0, 5).forEach((q, idx) => {
      ctx += `  ${idx + 1}. [${q.id}] ${q.title} (${q.type})\n`;
    });

    return ctx;
  }
}
