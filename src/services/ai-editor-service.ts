/**
 * src/services/ai-editor-service.ts
 *
 * Client service for AI Questionnaire Editor
 */

import type { QuestionnaireModel } from '../schema/questionnaire-schema-types';

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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface EditorSessionData {
  sessionId: string;
  surveyId: string;
  originalSurvey: QuestionnaireModel;
  workingSurvey: QuestionnaireModel;
  chatHistory: ChatMessage[];
  diff: SurveyDiffSummary;
}

export class AiEditorClientService {
  /**
   * Start or fetch session for a survey
   */
  public static async startSession(surveyId: string): Promise<EditorSessionData> {
    const res = await fetch('/api/ai-editor/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surveyId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to start editor session' }));
      throw new Error(err.error || 'Failed to start editor session');
    }
    return res.json();
  }

  /**
   * Send prompt to AI agent
   */
  public static async sendChat(
    sessionId: string,
    prompt: string
  ): Promise<{
    reply: string;
    workingSurvey: QuestionnaireModel;
    chatHistory: ChatMessage[];
    diff: SurveyDiffSummary;
    toolCallsExecuted: number;
  }> {
    const res = await fetch('/api/ai-editor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, prompt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to run AI editor' }));
      throw new Error(err.error || 'Failed to run AI editor');
    }
    return res.json();
  }

  /**
   * Accept and apply working changes to official survey
   */
  public static async applyChanges(
    sessionId: string
  ): Promise<{ success: boolean; surveyId: string; appliedSurvey: QuestionnaireModel; diff: SurveyDiffSummary }> {
    const res = await fetch('/api/ai-editor/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to apply changes' }));
      throw new Error(err.error || 'Failed to apply changes');
    }
    return res.json();
  }

  /**
   * Discard working changes
   */
  public static async discardChanges(
    sessionId: string
  ): Promise<{ success: boolean; workingSurvey: QuestionnaireModel; diff: SurveyDiffSummary }> {
    const res = await fetch('/api/ai-editor/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to discard changes' }));
      throw new Error(err.error || 'Failed to discard changes');
    }
    return res.json();
  }
}
