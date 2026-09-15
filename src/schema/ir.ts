/**
 * src/schema/ir.ts
 *
 * Intermediate Representation (IR), Intent protocols, and Diff structures for AI editing.
 */

import type { QuestionnaireModel, QuestionItemModel, JumpRule } from './types';
import { normalizeQuestionnaire } from './normalizer';

export type SurveyEditActionType =
  | 'add_question'
  | 'update_question'
  | 'delete_question'
  | 'reorder_questions'
  | 'add_jump'
  | 'remove_jump'
  | 'update_metadata';

export interface SurveyEditIntent {
  action: SurveyEditActionType;
  targetId?: string;
  description: string;
  payload?: any;
}

export interface QuestionnaireDiff {
  metaChanges?: {
    title?: string;
    description?: string;
  };
  addQuestions?: QuestionItemModel[];
  updateQuestions?: Array<{
    id: string;
    changes: Partial<QuestionItemModel>;
  }>;
  deleteQuestionIds?: string[];
  addJumps?: JumpRule[];
  deleteJumps?: Array<{ from: string; to: string }>;
}

export class QuestionnaireIrEngine {
  /**
   * Deterministically apply a structural Diff to a base questionnaire
   */
  public static applyDiff(
    base: QuestionnaireModel,
    diff: QuestionnaireDiff
  ): QuestionnaireModel {
    const updated = normalizeQuestionnaire(JSON.parse(JSON.stringify(base)));

    // 1. Metadata updates
    if (diff.metaChanges?.title) {
      updated.title = diff.metaChanges.title.trim();
    }
    if (diff.metaChanges?.description !== undefined) {
      updated.description = diff.metaChanges.description.trim();
    }

    // 2. Question deletions
    if (Array.isArray(diff.deleteQuestionIds) && diff.deleteQuestionIds.length > 0) {
      const deleteSet = new Set(diff.deleteQuestionIds);
      updated.questions = updated.questions.filter((q) => !deleteSet.has(q.id));
      if (updated.jumps) {
        updated.jumps = updated.jumps.filter(
          (j) => !deleteSet.has(j.from || '') && !deleteSet.has(j.to)
        );
      }
    }

    // 3. Question modifications
    if (Array.isArray(diff.updateQuestions) && diff.updateQuestions.length > 0) {
      const updateMap = new Map(diff.updateQuestions.map((u) => [u.id, u.changes]));
      for (let i = 0; i < updated.questions.length; i++) {
        const q = updated.questions[i];
        const changes = updateMap.get(q.id);
        if (changes) {
          updated.questions[i] = {
            ...q,
            ...changes,
            id: q.id, // Preserve ID
          };
        }
      }
    }

    // 4. Question additions
    if (Array.isArray(diff.addQuestions) && diff.addQuestions.length > 0) {
      for (const newQ of diff.addQuestions) {
        if (!updated.questions.some((q) => q.id === newQ.id)) {
          updated.questions.push(newQ);
        }
      }
    }

    // 5. Jump deletions
    if (Array.isArray(diff.deleteJumps) && diff.deleteJumps.length > 0 && updated.jumps) {
      const toDelete = new Set(diff.deleteJumps.map((d) => `${d.from}->${d.to}`));
      updated.jumps = updated.jumps.filter((j) => !toDelete.has(`${j.from}->${j.to}`));
    }

    // 6. Jump additions
    if (Array.isArray(diff.addJumps) && diff.addJumps.length > 0) {
      if (!updated.jumps) updated.jumps = [];
      for (const j of diff.addJumps) {
        updated.jumps.push(j);
      }
    }

    return normalizeQuestionnaire(updated);
  }
}
