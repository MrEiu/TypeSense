/**
 * server/ai/filler/plugins/batch/context.ts
 *
 * Context builder for Batch Aggregation Strategy.
 * Clusters related questions into Information Bundles for single-turn multi-field elicitation.
 */

import type {
  QuestionItemModel,
  QuestionAnswerMap,
} from '../../../../../src/schema/questionnaire-schema-types';
import { normalizeOptions } from '../../../../../src/schema/normalizer';

export interface QuestionBundle {
  id: string;
  name: string;
  questions: QuestionItemModel[];
  unfilledCount: number;
}

export class BatchContextBuilder {
  /**
   * Partitions unanswered questions into bundles of 2~4 questions
   */
  public static buildBundles(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap
  ): QuestionBundle[] {
    const unanswered = questions.filter(
      (q) => currentAnswers[q.id] === undefined || currentAnswers[q.id] === null || currentAnswers[q.id] === ''
    );

    const bundles: QuestionBundle[] = [];
    const BUNDLE_SIZE = 3;

    for (let i = 0; i < unanswered.length; i += BUNDLE_SIZE) {
      const slice = unanswered.slice(i, i + BUNDLE_SIZE);
      const titles = slice.map((q) => q.title.slice(0, 10)).join('、');
      bundles.push({
        id: `bundle_${Math.floor(i / BUNDLE_SIZE) + 1}`,
        name: `信息组: ${titles}`,
        questions: slice,
        unfilledCount: slice.length,
      });
    }

    return bundles;
  }

  /**
   * Retrieves active bundle and formatted requirements
   */
  public static getActiveBundlePrompt(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap
  ): { activeBundle: QuestionBundle | null; promptContext: string } {
    const bundles = this.buildBundles(questions, currentAnswers);
    if (bundles.length === 0) {
      return { activeBundle: null, promptContext: '全部题目已填妥。' };
    }

    const activeBundle = bundles[0];
    let promptContext = `【当前聚合题目信息包（请一次性向用户索取这批信息）】\n`;

    activeBundle.questions.forEach((q, idx) => {
      const opts = normalizeOptions(q.options);
      const optStr = opts.length > 0 ? ` 可选选项: [${opts.map((o) => `${o.index}:${o.label}`).join(', ')}]` : '';
      promptContext += `  ${idx + 1}. [${q.id}] ${q.title} (${q.type})${optStr}\n`;
    });

    return { activeBundle, promptContext };
  }
}
