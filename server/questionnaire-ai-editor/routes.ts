/**
 * server/questionnaire-ai-editor/routes.ts
 *
 * REST API routes for AI questionnaire editor
 */

import { Router, Request, Response } from 'express';
import { EditorSessionManager } from './session';
import { SurveyAiEditorAgent } from './agent';

export const aiEditorRouter = Router();

/**
 * Start or retrieve an editing session for a survey
 */
aiEditorRouter.post('/session', (req: Request, res: Response) => {
  try {
    const { surveyId } = req.body;
    if (!surveyId || typeof surveyId !== 'string') {
      res.status(400).json({ error: 'surveyId is required.' });
      return;
    }

    const session = EditorSessionManager.getOrCreateSession(surveyId);
    const diff = EditorSessionManager.getDiffSummary(session.sessionId);

    res.json({
      sessionId: session.sessionId,
      surveyId: session.surveyId,
      originalSurvey: session.originalSurvey,
      workingSurvey: session.workingSurvey,
      chatHistory: session.chatHistory,
      diff,
    });
  } catch (err: any) {
    console.error('[AiEditor] Failed to get/create session:', err);
    res.status(500).json({ error: err.message || 'Failed to initialize editor session.' });
  }
});

/**
 * Send editing instruction to the AI agent
 */
aiEditorRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { sessionId, prompt } = req.body;
    if (!sessionId || !prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'sessionId and prompt are required.' });
      return;
    }

    const session = EditorSessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: `Session "${sessionId}" expired or not found.` });
      return;
    }

    const result = await SurveyAiEditorAgent.run({
      sessionId,
      userPrompt: prompt.trim(),
    });

    const updatedSession = EditorSessionManager.getSession(sessionId)!;
    const diff = EditorSessionManager.getDiffSummary(sessionId);

    res.json({
      reply: result.reply,
      workingSurvey: updatedSession.workingSurvey,
      chatHistory: updatedSession.chatHistory,
      diff,
      toolCallsExecuted: result.toolCallsExecuted,
    });
  } catch (err: any) {
    console.error('[AiEditor] Agent chat error:', err);
    res.status(500).json({ error: err.message || 'AI editor execution failed.' });
  }
});

/**
 * Apply working copy to official survey JSON
 */
aiEditorRouter.post('/apply', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required.' });
      return;
    }

    const session = EditorSessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: `Session "${sessionId}" not found.` });
      return;
    }

    const success = EditorSessionManager.applyChanges(sessionId);
    if (!success) {
      res.status(500).json({ error: 'Failed to apply changes to official survey JSON.' });
      return;
    }

    const diff = EditorSessionManager.getDiffSummary(sessionId);

    res.json({
      success: true,
      surveyId: session.surveyId,
      appliedSurvey: session.workingSurvey,
      diff,
    });
  } catch (err: any) {
    console.error('[AiEditor] Apply error:', err);
    res.status(500).json({ error: err.message || 'Failed to apply changes.' });
  }
});

/**
 * Discard working copy changes and revert to original survey
 */
aiEditorRouter.post('/discard', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required.' });
      return;
    }

    const session = EditorSessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: `Session "${sessionId}" not found.` });
      return;
    }

    const reverted = EditorSessionManager.discardChanges(sessionId);
    const diff = EditorSessionManager.getDiffSummary(sessionId);

    res.json({
      success: true,
      workingSurvey: reverted.workingSurvey,
      diff,
    });
  } catch (err: any) {
    console.error('[AiEditor] Discard error:', err);
    res.status(500).json({ error: err.message || 'Failed to discard changes.' });
  }
});
