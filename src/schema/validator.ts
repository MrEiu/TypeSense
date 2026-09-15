/**
 * server/schema/validator.ts
 *
 * Runtime schema validator for questionnaire structures, jumps, and responses.
 */

import type {
  QuestionnaireModel,
  QuestionItemModel,
  JumpRule,
  QuestionAnswerMap,
} from './types';
import { normalizeOptions, normalizeStatements } from './normalizer';

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class SchemaValidator {
  /**
   * Validate full questionnaire schema
   */
  public static validateQuestionnaire(survey: QuestionnaireModel): ValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!survey.title || typeof survey.title !== 'string' || survey.title.trim().length === 0) {
      errors.push('问卷标题不能为空');
    }

    if (!Array.isArray(survey.questions) || survey.questions.length === 0) {
      errors.push('问卷至少需要包含 1 道题目');
      return { isValid: false, errors, warnings };
    }

    const questionIds = new Set<string>();
    const reservedTargets = new Set(['end', 'exit']);

    // 1. Validate questions
    for (let i = 0; i < survey.questions.length; i++) {
      const q = survey.questions[i];
      const qIndexStr = `第 ${i + 1} 题`;

      if (!q.id || typeof q.id !== 'string') {
        errors.push(`${qIndexStr} 缺少合法题目 ID`);
      } else if (questionIds.has(q.id)) {
        errors.push(`检测到重复题目 ID: "${q.id}"`);
      } else {
        questionIds.add(q.id);
      }

      if (!q.title || typeof q.title !== 'string' || q.title.trim().length === 0) {
        warnings.push(`${qIndexStr} (${q.id}) 题干为空`);
      }

      const validTypes = ['single_choice', 'multiple_choice', 'text_input', 'likert_scale'];
      if (!validTypes.includes(q.type)) {
        errors.push(`${qIndexStr} (${q.id}) 包含未知题型: "${q.type}"`);
      }

      if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        const opts = normalizeOptions(q.options);
        if (opts.length < 2) {
          warnings.push(`${qIndexStr} (${q.id}) 选择题选项少于 2 项`);
        }
      }

      if (q.type === 'likert_scale') {
        const opts = normalizeOptions(q.options);
        const stmts = normalizeStatements(q.statements);
        if (opts.length === 0) {
          warnings.push(`${qIndexStr} (${q.id}) 评分量表缺少评分刻度选项`);
        }
        if (stmts.length === 0) {
          warnings.push(`${qIndexStr} (${q.id}) 矩阵量表缺少纵向评价维度条目`);
        }
      }
    }

    // 2. Validate jumps
    const allJumps: JumpRule[] = [];
    if (Array.isArray(survey.jumps)) {
      allJumps.push(...survey.jumps);
    }
    for (const q of survey.questions) {
      if (typeof q.jump === 'string') {
        allJumps.push({ from: q.id, to: q.jump });
      } else if (Array.isArray(q.jump)) {
        for (const rule of q.jump) {
          allJumps.push({ ...rule, from: rule.from || q.id });
        }
      }
    }

    for (const jump of allJumps) {
      if (!jump.to) {
        errors.push(`跳转规则缺少目标题目 (to)`);
        continue;
      }
      const target = jump.to.trim();
      if (!reservedTargets.has(target) && !questionIds.has(target)) {
        warnings.push(`跳转目标 "${target}" 在问卷中不存在（悬空跳转引用）`);
      }
      if (jump.from && jump.from === target) {
        errors.push(`题目 "${jump.from}" 存在指向自身的自环跳转`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate question answers map against questionnaire definition
   */
  public static validateAnswers(
    questions: QuestionItemModel[],
    answers: QuestionAnswerMap
  ): ValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const questionMap = new Map<string, QuestionItemModel>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }

    for (const [qId, val] of Object.entries(answers)) {
      const q = questionMap.get(qId);
      if (!q) {
        warnings.push(`答案中包含未在问卷中定义的题目: "${qId}"`);
        continue;
      }

      if (val === null || val === undefined || val === '') continue;

      const opts = normalizeOptions(q.options);
      switch (q.type) {
        case 'single_choice': {
          const idx = Number(val);
          if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) {
            errors.push(`题目 ${qId} 单选题答案越界或非整数: ${val}`);
          }
          break;
        }
        case 'multiple_choice': {
          if (!Array.isArray(val)) {
            errors.push(`题目 ${qId} 多选题答案必须为数组`);
          } else {
            for (const item of val) {
              const idx = Number(item);
              if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) {
                errors.push(`题目 ${qId} 多选选项索引越界: ${item}`);
              }
            }
          }
          break;
        }
        case 'likert_scale': {
          if (typeof val === 'number') {
            if (!Number.isInteger(val) || val < 0 || val >= opts.length) {
              errors.push(`题目 ${qId} 量表分值越界: ${val}`);
            }
          } else if (typeof val === 'object' && !Array.isArray(val)) {
            for (const [sKey, sVal] of Object.entries(val)) {
              const sIdx = Number(sVal);
              if (!Number.isInteger(sIdx) || sIdx < 0 || sIdx >= opts.length) {
                errors.push(`题目 ${qId} 量表子项 "${sKey}" 评分越界: ${sVal}`);
              }
            }
          }
          break;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
