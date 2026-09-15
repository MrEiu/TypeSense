/**
 * server/ai/generator/result-parser.ts
 *
 * Result parser, question assembler, variable cleaner, and schema normalizer for AI generated surveys.
 */

import type { QuestionItemModel } from '../../../src/schema/questionnaire-schema-types';
import { SurveyGraphValidator } from './validator';

export interface SurveyTaskItem {
  id: `b${number}`;
  count: number;
  prompt: string;
  status?: 'pending' | 'running' | 'done' | 'failed';
}

export class GeneratorResultParser {
  /**
   * Remove unused local variable registrations from questions
   */
  public static cleanUnusedVariables(questions: QuestionItemModel[]): QuestionItemModel[] {
    const usedIdentifiers = new Set<string>();

    // 1. Scan variable identifiers referenced in jump rules
    for (const q of questions) {
      if (Array.isArray(q.jump)) {
        for (const rule of q.jump) {
          if (rule.when && typeof rule.when === 'object') {
            for (const key of Object.keys(rule.when)) {
              usedIdentifiers.add(key.trim());
            }
          }
        }
      }
    }

    // 2. Scan variable identifiers referenced in set formulas
    for (const q of questions) {
      if (q.set && typeof q.set === 'object') {
        for (const formula of Object.values(q.set)) {
          if (typeof formula === 'string') {
            const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
            if (matches) {
              matches.forEach((id) => usedIdentifiers.add(id));
            }
          }
        }
      }
    }

    // 3. Scan interpolation variables in titles, descriptions, placeholders
    const interpolationRegex = /(?:\{\{|\$\{)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\}\}|\})/g;
    for (const q of questions) {
      const texts = [q.title, q.description, q.placeholder].filter(Boolean) as string[];
      for (const text of texts) {
        let match: RegExpExecArray | null;
        while ((match = interpolationRegex.exec(text)) !== null) {
          if (match[1]) {
            usedIdentifiers.add(match[1].trim());
          }
        }
      }
    }

    // 4. Clean unused set entries
    return questions.map((q) => {
      if (!q.set || typeof q.set !== 'object') {
        return q;
      }

      const activeSet: Record<string, string | number> = {};
      for (const [varName, expr] of Object.entries(q.set)) {
        if (usedIdentifiers.has(varName) && varName !== q.id) {
          activeSet[varName] = expr;
        }
      }

      const updated = { ...q };
      if (Object.keys(activeSet).length > 0) {
        updated.set = activeSet;
      } else {
        delete updated.set;
      }
      return updated;
    });
  }

  /**
   * Deterministic Re-indexing: assemble questions from blocks into global continuous sequence
   */
  public static assembleQuestions(
    tasks: SurveyTaskItem[],
    blockResults: Map<string, QuestionItemModel[]>
  ): QuestionItemModel[] {
    const rawOrderedQuestions: QuestionItemModel[] = [];
    const idMap = new Map<string, string>();

    let globalIndex = 1;
    for (const task of tasks) {
      const blockQs = blockResults.get(task.id) || [];
      for (const q of blockQs) {
        const globalId = `q${globalIndex++}`;
        idMap.set(q.id, globalId);
        rawOrderedQuestions.push({ ...q });
      }
    }

    // Translate IDs and internal jump references
    const assembled: QuestionItemModel[] = rawOrderedQuestions.map((q) => {
      const newId = idMap.get(q.id) || q.id;
      let newJump = q.jump;

      if (Array.isArray(q.jump)) {
        newJump = q.jump.map((rule: any) => {
          const target = rule.to ? String(rule.to).trim() : '';
          const translatedTo = idMap.get(target) || target;
          let translatedWhen = rule.when;

          if (rule.when && typeof rule.when === 'object') {
            translatedWhen = {};
            for (const [key, val] of Object.entries(rule.when)) {
              const mappedKey = idMap.get(key) || key;
              translatedWhen[mappedKey] = val;
            }
          }

          return {
            ...rule,
            to: translatedTo,
            when: translatedWhen,
          };
        });
      }

      return {
        ...q,
        id: newId,
        jump: newJump,
      };
    });

    const safeQuestions = SurveyGraphValidator.fastAcyclicGuard(assembled);
    return this.cleanUnusedVariables(safeQuestions);
  }

  /**
   * Sanitize questions parsed from direct generation
   */
  public static sanitizeDirectQuestions(rawQuestions: any[]): QuestionItemModel[] {
    return rawQuestions.map((q: any, i: number) => {
      const id = `q${i + 1}`;
      const type = ['single_choice', 'multiple_choice', 'likert_scale', 'text_input'].includes(q.type)
        ? q.type
        : 'single_choice';

      const rawOptions = Array.isArray(q.options) ? q.options : [];
      let options = rawOptions
        .map((o: any) => (typeof o === 'string' ? o : o?.label || o?.title || String(o)))
        .filter((o: string) => o.trim());

      const rawStatements =
        q.statements || q.rows || q.items || q.sub_questions || q.subQuestions || q.dimensions || q.aspects;
      let statements = Array.isArray(rawStatements)
        ? rawStatements
            .map((s: any) => (typeof s === 'string' ? s : s?.label || s?.title || String(s)))
            .filter((s: string) => s.trim())
        : undefined;

      if (type === 'likert_scale') {
        if (!options || options.length === 0) options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
        if (!statements || statements.length === 0) statements = ['整体表现与综合满意度'];
      }

      if ((type === 'single_choice' || type === 'multiple_choice') && options.length === 0) {
        options = ['选项 A', '选项 B'];
      }

      return {
        id,
        type,
        title: String(q.title || `题目 ${i + 1}`).trim(),
        options: type === 'text_input' ? undefined : options,
        statements: type === 'likert_scale' ? statements : undefined,
        description: q.description ? String(q.description).trim() : undefined,
        placeholder: type === 'text_input' ? q.placeholder || '请输入您的回答...' : undefined,
        required: q.required !== false,
        jump: q.jump,
        set: q.set,
      };
    });
  }

  /**
   * Sanitize questions generated for an individual worker block
   */
  public static sanitizeWorkerQuestions(rawQuestions: any[], blockId: string): QuestionItemModel[] {
    return rawQuestions.map((q: any, idx: number) => {
      const type = q.type || 'single_choice';
      const questionId = `${blockId}_${idx + 1}`;
      let options = Array.isArray(q.options)
        ? q.options.filter((o: any) => typeof o === 'string' && o.trim())
        : undefined;

      if ((type === 'single_choice' || type === 'multiple_choice') && (!options || options.length < 2)) {
        options = ['选项 A', '选项 B'];
      }

      let statements = Array.isArray(q.statements)
        ? q.statements.filter((s: any) => typeof s === 'string' && s.trim())
        : undefined;
      if (type === 'likert_scale') {
        if (!options || options.length === 0) options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
        if (!statements || statements.length === 0) statements = ['整体评价'];
      }

      return {
        id: questionId,
        type,
        title: String(q.title || `题目 ${idx + 1}`).trim(),
        options: type === 'text_input' ? undefined : options,
        statements: type === 'likert_scale' ? statements : undefined,
        placeholder: type === 'text_input' ? q.placeholder || '请输入您的回答...' : undefined,
        required: q.required !== false,
        jump: q.jump,
      };
    });
  }
}
