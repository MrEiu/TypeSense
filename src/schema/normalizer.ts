/**
 * src/schema/normalizer.ts
 *
 * Normalization utilities and bidirectional adapters for questionnaire entities.
 * Ensures consistent options indexing, statement normalization, and first-class jumps extraction.
 */

import type {
  QuestionnaireModel,
  QuestionItemModel,
  NormalizedOption,
  RawOption,
  JumpRule,
} from './types';

/**
 * Standardize question options to normalized { id, label } records
 */
export function normalizeOptions(options?: RawOption[]): NormalizedOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((opt, index) => {
    if (typeof opt === 'string') {
      return { id: String(index), label: opt };
    }
    const label = opt.label || `选项 ${index + 1}`;
    const id = opt.id ?? String(index);
    return { id, label };
  });
}

/**
 * Standardize Likert scale statements to normalized { id, label } records
 */
export function normalizeStatements(
  statements?: (string | { id?: string; label?: string })[]
): NormalizedOption[] {
  if (!Array.isArray(statements) || statements.length === 0) return [];
  return statements.map((item, index) => {
    if (typeof item === 'string') {
      return { id: String(index), label: item };
    }
    const label = item.label || `条目 ${index + 1}`;
    const id = item.id ?? String(index);
    return { id, label };
  });
}

/**
 * Extract question-embedded jump rules into a top-level jumps table
 */
export function extractTopLevelJumps(questions: QuestionItemModel[]): JumpRule[] {
  const jumps: JumpRule[] = [];

  for (const q of questions) {
    if (!q.jump) continue;

    if (typeof q.jump === 'string') {
      jumps.push({
        from: q.id,
        to: q.jump.trim(),
        else: true,
      });
    } else if (Array.isArray(q.jump)) {
      for (const rule of q.jump) {
        if (rule && rule.to) {
          jumps.push({
            ...rule,
            from: q.id,
            to: rule.to.trim(),
          });
        }
      }
    }
  }

  return jumps;
}

/**
 * Bidirectional adapter: Embed top-level jumps into questions for renderers or flow engines
 */
export function embedJumpsToQuestions(
  questions: QuestionItemModel[],
  jumps?: JumpRule[]
): QuestionItemModel[] {
  if (!jumps || jumps.length === 0) return questions;

  const jumpsByFrom = new Map<string, JumpRule[]>();
  for (const j of jumps) {
    if (!j.from) continue;
    if (!jumpsByFrom.has(j.from)) {
      jumpsByFrom.set(j.from, []);
    }
    jumpsByFrom.get(j.from)!.push(j);
  }

  return questions.map((q) => {
    const matchingJumps = jumpsByFrom.get(q.id);
    if (!matchingJumps || matchingJumps.length === 0) {
      return q;
    }
    return {
      ...q,
      jump: matchingJumps,
    };
  });
}

/**
 * Full questionnaire normalization pipeline
 */
export function normalizeQuestionnaire(raw: any): QuestionnaireModel {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid questionnaire payload: must be an object.');
  }

  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const normalizedQuestions: QuestionItemModel[] = rawQuestions.map((q: any, idx: number) => {
    const id = q.id ? String(q.id).trim() : `q${idx + 1}`;
    const type = ['single_choice', 'multiple_choice', 'likert_scale', 'text_input'].includes(q.type)
      ? q.type
      : 'single_choice';

    let options = Array.isArray(q.options) ? q.options : undefined;
    let statements = Array.isArray(q.statements) ? q.statements : undefined;

    if (type === 'likert_scale') {
      if (!options || options.length === 0) options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
      if (!statements || statements.length === 0) statements = ['整体评价'];
    }

    return {
      id,
      type,
      title: String(q.title || `题目 ${idx + 1}`).trim(),
      options: type === 'text_input' ? undefined : options,
      statements: type === 'likert_scale' ? statements : undefined,
      description: q.description ? String(q.description).trim() : undefined,
      placeholder: type === 'text_input' ? (q.placeholder || '请输入您的回答...') : undefined,
      required: q.required !== false,
      jump: q.jump,
      set: q.set && typeof q.set === 'object' ? q.set : undefined,
    };
  });

  // Extract or preserve top-level jumps
  const topLevelJumps = Array.isArray(raw.jumps) && raw.jumps.length > 0
    ? raw.jumps
    : extractTopLevelJumps(normalizedQuestions);

  return {
    id: String(raw.id || '').trim(),
    slug: raw.slug ? String(raw.slug).trim() : undefined,
    title: String(raw.title || '问卷').trim(),
    description: raw.description ? String(raw.description).trim() : '',
    status: raw.status === 'paused' ? 'paused' : 'published',
    questions: normalizedQuestions,
    jumps: topLevelJumps,
    variables: raw.variables && typeof raw.variables === 'object' ? raw.variables : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
