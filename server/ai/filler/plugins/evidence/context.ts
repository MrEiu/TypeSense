/**
 * server/ai/filler/plugins/evidence/context.ts
 *
 * Context builder for Evidence Priority Strategy.
 * Aggregates all user statements into an Evidence Ledger and maps evidence quotes to candidate questions.
 */

import type {
  QuestionItemModel,
  QuestionAnswerMap,
} from '../../../../../src/schema/questionnaire-schema-types';
import { normalizeOptions } from '../../../../../src/schema/normalizer';

export interface EvidenceItem {
  index: number;
  statement: string;
}

export class EvidenceContextBuilder {
  /**
   * Compiles user statements into an indexed Evidence Ledger
   */
  public static buildEvidenceLedger(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): EvidenceItem[] {
    const userStatements = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.trim())
      .filter(Boolean);

    return userStatements.map((stmt, idx) => ({
      index: idx + 1,
      statement: stmt,
    }));
  }

  /**
   * Builds prompt context including the full Evidence Ledger and question criteria
   */
  public static buildPromptContext(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap,
    ledger: EvidenceItem[]
  ): string {
    let ctx = `【事实证据库 (Evidence Ledger)】\n`;
    if (ledger.length === 0) {
      ctx += `(用户尚未提供任何事实陈述)\n`;
    } else {
      ledger.forEach((item) => {
        ctx += `  [证据E${item.index}]: "${item.statement}"\n`;
      });
    }

    ctx += `\n【待核验匹配的问卷题目与标准规则】\n`;
    const unanswered = questions.filter(
      (q) => currentAnswers[q.id] === undefined || currentAnswers[q.id] === null || currentAnswers[q.id] === ''
    );

    unanswered.slice(0, 6).forEach((q, idx) => {
      const opts = normalizeOptions(q.options);
      const optStr = opts.length > 0 ? ` 选项: [${opts.map((o) => `${o.index}:${o.label}`).join(', ')}]` : '';
      ctx += `  ${idx + 1}. [${q.id}] ${q.title} (${q.type})${optStr}\n`;
    });

    return ctx;
  }
}
