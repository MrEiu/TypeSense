/**
 * server/ai/generator/validator.ts
 *
 * Fast acyclic guard algorithm for questionnaire directed jump graphs.
 * O(V+E) single-pass cycle detection and break.
 */

import type { QuestionItemModel } from '../../../src/schema/questionnaire-schema-types';

export class SurveyGraphValidator {
  /**
   * Fast acyclic graph guard (DFS 3-color cycle breaker)
   */
  public static fastAcyclicGuard(questions: QuestionItemModel[]): QuestionItemModel[] {
    const existingIds = new Set(questions.map((q) => q.id));

    // 1. Filter dangling targets and self-loops (u -> u)
    for (const q of questions) {
      if (!q.jump) continue;

      if (typeof q.jump === 'string') {
        const target = q.jump.trim();
        if (target === q.id || (target !== 'exit' && target !== 'end' && !existingIds.has(target))) {
          delete q.jump;
        }
      } else if (Array.isArray(q.jump)) {
        const filteredRules = q.jump.filter((rule) => {
          const target = rule.to?.trim();
          if (!target || target === q.id) return false;
          return target === 'exit' || target === 'end' || existingIds.has(target);
        });
        if (filteredRules.length > 0) {
          q.jump = filteredRules;
        } else {
          delete q.jump;
        }
      }
    }

    // 2. Directed graph cycle detection (DFS 3-color method)
    const adj = new Map<string, string[]>();
    for (const q of questions) {
      const targets: string[] = [];
      if (typeof q.jump === 'string') {
        targets.push(q.jump.trim());
      } else if (Array.isArray(q.jump)) {
        for (const rule of q.jump) {
          if (rule.to) targets.push(rule.to.trim());
        }
      }
      adj.set(q.id, targets);
    }

    const state = new Map<string, number>();
    const safeQuestions = questions.map((q) => ({ ...q }));

    const detectAndBreak = (u: string) => {
      state.set(u, 1);
      const targets = adj.get(u) || [];
      const validTargets: string[] = [];

      for (const v of targets) {
        if (v === 'exit' || v === 'end') {
          validTargets.push(v);
          continue;
        }

        const vState = state.get(v) || 0;
        if (vState === 1) {
          console.warn(`[FastAcyclicGuard] Detected cycle: ${u} -> ${v}, automatically broken.`);
          continue;
        }

        if (vState === 0) {
          detectAndBreak(v);
        }
        validTargets.push(v);
      }

      const targetSet = new Set(validTargets);
      const currQ = safeQuestions.find((q) => q.id === u);
      if (currQ && currQ.jump) {
        if (typeof currQ.jump === 'string') {
          if (!targetSet.has(currQ.jump.trim())) {
            delete currQ.jump;
          }
        } else if (Array.isArray(currQ.jump)) {
          currQ.jump = currQ.jump.filter((r) => r.to && targetSet.has(r.to.trim()));
          if (currQ.jump.length === 0) {
            delete currQ.jump;
          }
        }
      }

      state.set(u, 2);
    };

    for (const q of questions) {
      if ((state.get(q.id) || 0) === 0) {
        detectAndBreak(q.id);
      }
    }

    return safeQuestions;
  }
}
