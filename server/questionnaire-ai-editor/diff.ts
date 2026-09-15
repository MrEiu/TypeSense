/**
 * server/questionnaire-ai-editor/diff.ts
 *
 * Compute survey structure diff summary between original and working versions
 */

export interface QuestionDiffItem {
  id: string;
  title: string;
  type: 'added' | 'modified' | 'deleted' | 'unchanged';
  detail?: string;
}

export interface SurveyDiffSummary {
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  titleChanged: boolean;
  descriptionChanged: boolean;
  changes: QuestionDiffItem[];
  hasChanges: boolean;
}

export class SurveyDiffCalculator {
  /**
   * Calculate diff summary between original and working survey objects
   */
  public static computeDiff(
    original: Record<string, unknown> | null,
    working: Record<string, unknown> | null
  ): SurveyDiffSummary {
    if (!original || !working) {
      return {
        addedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        titleChanged: false,
        descriptionChanged: false,
        changes: [],
        hasChanges: false,
      };
    }

    const origQuestions: Array<Record<string, unknown>> = Array.isArray(original.questions)
      ? (original.questions as Array<Record<string, unknown>>)
      : [];
    const workQuestions: Array<Record<string, unknown>> = Array.isArray(working.questions)
      ? (working.questions as Array<Record<string, unknown>>)
      : [];

    const origMap = new Map<string, Record<string, unknown>>();
    origQuestions.forEach((q) => {
      if (typeof q.id === 'string') origMap.set(q.id, q);
    });

    const workMap = new Map<string, Record<string, unknown>>();
    workQuestions.forEach((q) => {
      if (typeof q.id === 'string') workMap.set(q.id, q);
    });

    const changes: QuestionDiffItem[] = [];
    let addedCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;

    // Check additions and modifications in working copy
    for (const wQ of workQuestions) {
      const qId = String(wQ.id || '');
      const origQ = origMap.get(qId);
      const title = String(wQ.title || 'Untitled');

      if (!origQ) {
        addedCount++;
        changes.push({
          id: qId,
          title,
          type: 'added',
          detail: `新增题目 [${wQ.type || 'unknown'}]`,
        });
      } else {
        const isModified = JSON.stringify(wQ) !== JSON.stringify(origQ);
        if (isModified) {
          modifiedCount++;
          changes.push({
            id: qId,
            title,
            type: 'modified',
            detail: `调整题目内容/选项/逻辑`,
          });
        }
      }
    }

    // Check deletions from original
    for (const oQ of origQuestions) {
      const qId = String(oQ.id || '');
      if (!workMap.has(qId)) {
        deletedCount++;
        changes.push({
          id: qId,
          title: String(oQ.title || 'Untitled'),
          type: 'deleted',
          detail: `删除原题目`,
        });
      }
    }

    const titleChanged = String(original.title || '') !== String(working.title || '');
    const descriptionChanged = String(original.description || '') !== String(working.description || '');
    const hasChanges = addedCount > 0 || modifiedCount > 0 || deletedCount > 0 || titleChanged || descriptionChanged;

    return {
      addedCount,
      modifiedCount,
      deletedCount,
      titleChanged,
      descriptionChanged,
      changes,
      hasChanges,
    };
  }
}
