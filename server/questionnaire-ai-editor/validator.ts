/**
 * server/questionnaire-ai-editor/validator.ts
 *
 * Survey JSON structure validator
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class SurveyValidator {
  /**
   * Validate questionnaire JSON structure
   */
  public static validateSurvey(survey: unknown): ValidationResult {
    if (!survey || typeof survey !== 'object' || Array.isArray(survey)) {
      return { valid: false, error: 'Survey root must be a valid JSON object.' };
    }

    const obj = survey as Record<string, unknown>;

    if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
      return { valid: false, error: 'Survey must have a non-empty string "title".' };
    }

    if (!Array.isArray(obj.questions)) {
      return { valid: false, error: 'Survey must contain a "questions" array.' };
    }

    const seenIds = new Set<string>();

    for (let i = 0; i < obj.questions.length; i++) {
      const q = obj.questions[i];
      if (!q || typeof q !== 'object' || Array.isArray(q)) {
        return { valid: false, error: `Question at index ${i} is not an object.` };
      }

      const qObj = q as Record<string, unknown>;
      if (typeof qObj.id !== 'string' || !qObj.id.trim()) {
        return { valid: false, error: `Question at index ${i} is missing a valid string "id".` };
      }

      if (seenIds.has(qObj.id)) {
        return { valid: false, error: `Duplicate question id "${qObj.id}" found at index ${i}.` };
      }
      seenIds.add(qObj.id);

      if (typeof qObj.title !== 'string' || !qObj.title.trim()) {
        return { valid: false, error: `Question "${qObj.id}" has an empty or invalid "title".` };
      }

      if (typeof qObj.type !== 'string' || !qObj.type.trim()) {
        return { valid: false, error: `Question "${qObj.id}" is missing a "type" field.` };
      }

      if (['single_choice', 'multiple_choice', 'dropdown', 'likert_scale'].includes(qObj.type)) {
        if (!Array.isArray(qObj.options) || qObj.options.length === 0) {
          return { valid: false, error: `Choice question "${qObj.id}" must have a non-empty "options" array.` };
        }
      }
    }

    return { valid: true };
  }
}
