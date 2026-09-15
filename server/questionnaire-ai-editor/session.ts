/**
 * server/questionnaire-ai-editor/session.ts
 *
 * Session and working copy manager for AI questionnaire editor
 */

import { nanoid } from 'nanoid';
import { SurveyService } from '../survey-service';
import { SurveyDiffCalculator, SurveyDiffSummary } from './diff';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: unknown }>;
}

export interface EditorSession {
  sessionId: string;
  surveyId: string;
  originalJson: string;
  originalSurvey: Record<string, unknown>;
  workingJson: string;
  workingSurvey: Record<string, unknown>;
  chatHistory: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export class EditorSessionManager {
  private static sessions = new Map<string, EditorSession>();

  /**
   * Start or get an existing editor session for a survey
   */
  public static getOrCreateSession(surveyId: string): EditorSession {
    // Find existing session for surveyId
    for (const session of this.sessions.values()) {
      if (session.surveyId === surveyId) {
        return session;
      }
    }

    // Load original survey from disk/db
    const survey = SurveyService.getSurvey(surveyId);
    if (!survey) {
      throw new Error(`Survey with ID "${surveyId}" not found.`);
    }

    const jsonStr = JSON.stringify(survey, null, 2);
    const sessionId = `ses_${nanoid(12)}`;

    const newSession: EditorSession = {
      sessionId,
      surveyId,
      originalJson: jsonStr,
      originalSurvey: JSON.parse(jsonStr),
      workingJson: jsonStr,
      workingSurvey: JSON.parse(jsonStr),
      chatHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, newSession);
    return newSession;
  }

  /**
   * Get session by sessionId
   */
  public static getSession(sessionId: string): EditorSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update working copy in memory
   */
  public static updateWorking(
    sessionId: string,
    newJson: string,
    newSurvey: Record<string, unknown>
  ): EditorSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    session.workingJson = newJson;
    session.workingSurvey = newSurvey;
    session.updatedAt = Date.now();
    return session;
  }

  /**
   * Add a message to chat history
   */
  public static addMessage(
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'timestamp'>
  ): ChatMessage {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    const fullMessage: ChatMessage = {
      id: nanoid(8),
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
      toolCalls: message.toolCalls,
    };

    session.chatHistory.push(fullMessage);
    session.updatedAt = Date.now();
    return fullMessage;
  }

  /**
   * Get current diff summary of a session
   */
  public static getDiffSummary(sessionId: string): SurveyDiffSummary {
    const session = this.sessions.get(sessionId);
    if (!session) {
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
    return SurveyDiffCalculator.computeDiff(session.originalSurvey, session.workingSurvey);
  }

  /**
   * Apply working copy to official survey JSON and database
   */
  public static applyChanges(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    const success = SurveyService.updateSurvey(session.surveyId, {
      title: String(session.workingSurvey.title || ''),
      description: String(session.workingSurvey.description || ''),
      schema: session.workingSurvey,
    });

    if (success) {
      // Update original baseline to match new saved version
      session.originalJson = session.workingJson;
      session.originalSurvey = JSON.parse(session.workingJson);
    }

    return success;
  }

  /**
   * Discard all working modifications and restore original survey
   */
  public static discardChanges(sessionId: string): EditorSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    session.workingJson = session.originalJson;
    session.workingSurvey = JSON.parse(session.originalJson);
    session.updatedAt = Date.now();
    return session;
  }

  /**
   * Remove session
   */
  public static removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
