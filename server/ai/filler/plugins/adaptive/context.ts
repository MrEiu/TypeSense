/**
 * server/ai/filler/plugins/adaptive/context.ts
 *
 * Context builder for Adaptive Exploration Strategy.
 * Profiles user communication style and question distribution to route to optimal sub-strategy.
 */

import type { QuestionItemModel, QuestionAnswerMap } from '../../../../../src/schema/questionnaire-schema-types';
import type { StrategyType } from '../../core/types';

export interface AdaptiveProfile {
  recommendedStrategy: StrategyType;
  userStyle: 'concise' | 'elaborate' | 'neutral' | 'impatient';
  questionProfile: 'demographic_heavy' | 'subjective_heavy' | 'mixed';
}

export class AdaptiveContextBuilder {
  /**
   * Evaluates user response style and question distribution
   */
  public static evaluateProfile(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): AdaptiveProfile {
    const userMessages = messages.filter((m) => m.role === 'user');
    const latestUserText = userMessages[userMessages.length - 1]?.content?.trim() || '';

    // 1. Detect impatience
    const impatientRegex = /(快点|别问了|好烦|直接填|赶紧|太麻烦|不想填)/;
    if (impatientRegex.test(latestUserText)) {
      return {
        recommendedStrategy: 'natural',
        userStyle: 'impatient',
        questionProfile: 'mixed',
      };
    }

    // 2. Detect user verbosity
    const totalLength = userMessages.reduce((sum, m) => sum + m.content.length, 0);
    const avgLength = userMessages.length > 0 ? totalLength / userMessages.length : 0;
    const userStyle = avgLength > 35 ? 'elaborate' : (avgLength < 10 && userMessages.length > 0 ? 'concise' : 'neutral');

    // 3. Inspect remaining unanswered questions
    const unanswered = questions.filter(
      (q) => currentAnswers[q.id] === undefined || currentAnswers[q.id] === null || currentAnswers[q.id] === ''
    );

    const demographicKeywords = /(年龄|职业|城市|性别|学历|年限|收入|行业)/;
    const hasDemographics = unanswered.some((q) => demographicKeywords.test(q.title));
    const textQuestions = unanswered.filter((q) => q.type === 'text_input');

    let questionProfile: 'demographic_heavy' | 'subjective_heavy' | 'mixed' = 'mixed';
    let recommendedStrategy: StrategyType = 'natural';

    if (hasDemographics && unanswered.length >= 3) {
      questionProfile = 'demographic_heavy';
      recommendedStrategy = 'batch';
    } else if (textQuestions.length >= 2 || userStyle === 'elaborate') {
      questionProfile = 'subjective_heavy';
      recommendedStrategy = 'deep';
    } else {
      recommendedStrategy = 'natural';
    }

    return {
      recommendedStrategy,
      userStyle,
      questionProfile,
    };
  }
}
