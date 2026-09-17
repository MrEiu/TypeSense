/**
 * server/ai/filler/plugins/natural/context.ts
 *
 * Context builder for Natural Guidance Strategy.
 * Identifies overall survey objectives and isolates candidate questions suitable for conversational elicitation.
 */

import type {
  QuestionItemModel,
  QuestionAnswerMap,
} from '../../../../../src/schema/questionnaire-schema-types';
import {
  normalizeOptions,
  normalizeStatements,
} from '../../../../../src/schema/normalizer';

export interface NaturalCandidateQuestion {
  id: string;
  type: string;
  title: string;
  optionsSummary: string;
  isCovered: boolean;
}

export class NaturalContextBuilder {
  /**
   * Filters candidate questions suitable for lightweight conversational extraction
   */
  public static buildCandidateQuestions(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap
  ): NaturalCandidateQuestion[] {
    return questions.map((q) => {
      const isAnswered = currentAnswers[q.id] !== undefined && currentAnswers[q.id] !== null && currentAnswers[q.id] !== '';
      const opts = normalizeOptions(q.options);
      const stmts = normalizeStatements(q.statements);

      let optionsSummary = '';
      if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        optionsSummary = `[${opts.map((o) => `${o.index}:${o.label}`).join(', ')}]`;
      } else if (q.type === 'likert_scale') {
        optionsSummary = stmts.length > 0
          ? `[量表维度: ${stmts.map((s) => s.label).join('; ')}; 刻度: ${opts.map((o) => `${o.index}:${o.label}`).join(', ')}]`
          : `[标尺刻度: ${opts.map((o) => `${o.index}:${o.label}`).join(', ')}]`;
      } else {
        optionsSummary = '[开放简答]';
      }

      return {
        id: q.id,
        type: q.type,
        title: q.title,
        optionsSummary,
        isCovered: isAnswered,
      };
    });
  }

  /**
   * Builds prompt context string highlighting uncovered conversational questions
   */
  public static buildPromptContext(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap
  ): string {
    const candidates = this.buildCandidateQuestions(questions, currentAnswers);
    const uncovered = candidates.filter((c) => !c.isCovered);
    const covered = candidates.filter((c) => c.isCovered);

    let ctx = `【问卷目标与题目状态】\n`;
    ctx += `- 已答题数: ${covered.length} / ${candidates.length}\n`;
    ctx += `待自然获知的核心题目（选最自然顺畅的1~2项引导，绝不要按顺序盘问）：\n`;

    uncovered.slice(0, 8).forEach((q, idx) => {
      ctx += `  ${idx + 1}. [${q.id}] (${q.type}) ${q.title} 选项: ${q.optionsSummary}\n`;
    });

    return ctx;
  }
}
