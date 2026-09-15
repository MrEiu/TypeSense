/**
 * server/routes/surveys.ts
 *
 * Survey management and shortlink routing endpoints.
 */

import { Router, Request, Response } from 'express';
import { SurveyService } from '../survey-service';

export const surveysRouter = Router();

/**
 * List all surveys
 */
surveysRouter.get('/api/surveys', (_req: Request, res: Response) => {
  try {
    const list = SurveyService.listSurveys();
    res.json(list);
  } catch (err) {
    console.error('[API] listSurveys error:', err);
    res.status(500).json({ error: '无法获取问卷列表' });
  }
});

/**
 * Get survey details by ID or Slug
 */
surveysRouter.get('/api/surveys/:id', (req: Request, res: Response) => {
  try {
    const survey = SurveyService.getSurvey(req.params.id);
    if (!survey) {
      res.status(404).json({ error: '问卷不存在' });
      return;
    }
    res.json(survey);
  } catch (err) {
    console.error('[API] getSurvey error:', err);
    res.status(500).json({ error: '无法读取问卷' });
  }
});

/**
 * Create a new survey
 */
surveysRouter.post('/api/surveys', (req: Request, res: Response) => {
  try {
    const { title, description, slug, schema } = req.body || {};
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: '问卷标题 title 不能为空' });
      return;
    }
    const result = SurveyService.createSurvey({
      title,
      description,
      slug,
      schema: schema || req.body,
    });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('[API] createSurvey error:', err);
    res.status(500).json({ error: '创建问卷失败' });
  }
});

/**
 * Update survey definition and questions schema
 */
surveysRouter.put('/api/surveys/:id', (req: Request, res: Response) => {
  try {
    const { title, description, schema } = req.body || {};
    const success = SurveyService.updateSurvey(req.params.id, {
      title,
      description,
      schema: schema || req.body,
    });
    if (!success) {
      res.status(404).json({ error: '问卷不存在或更新失败' });
      return;
    }
    res.json({ success, message: '问卷已成功保存更新' });
  } catch (err) {
    console.error('[API] updateSurvey error:', err);
    res.status(500).json({ error: '更新问卷失败' });
  }
});

/**
 * Delete survey by ID
 */
surveysRouter.delete('/api/surveys/:id', (req: Request, res: Response) => {
  try {
    const success = SurveyService.deleteSurvey(req.params.id);
    res.json({ success });
  } catch (err) {
    console.error('[API] deleteSurvey error:', err);
    res.status(500).json({ error: '删除问卷失败' });
  }
});

/**
 * Update survey collection status (published / paused)
 */
surveysRouter.patch('/api/surveys/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};
    if (status !== 'published' && status !== 'paused') {
      res.status(400).json({ error: '无效的状态参数，必须为 published 或 paused' });
      return;
    }
    const success = SurveyService.updateSurveyStatus(req.params.id, status);
    if (!success) {
      res.status(404).json({ error: '问卷不存在或更新失败' });
      return;
    }
    res.json({ success, status });
  } catch (err) {
    console.error('[API] updateSurveyStatus error:', err);
    res.status(500).json({ error: '更新问卷状态失败' });
  }
});

/**
 * Generate a unique access link code for a survey
 */
surveysRouter.post('/api/surveys/:id/links', (req: Request, res: Response) => {
  try {
    const result = SurveyService.createLink(req.params.id);
    if (!result) {
      res.status(404).json({ error: '问卷不存在，无法生成短链' });
      return;
    }
    res.json({
      success: true,
      code: result.code,
      surveyId: result.surveyId,
      fullUrl: `/s/${result.code}`,
    });
  } catch (err) {
    console.error('[API] createLink error:', err);
    res.status(500).json({ error: '生成访问短链失败' });
  }
});

/**
 * Shortlink redirect gateway
 */
surveysRouter.get('/s/:code', (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const realSurveyId = SurveyService.resolveLink(code);
    if (!realSurveyId) {
      res.status(404).send('<h3>404 - 无效或已失效的问卷访问链接</h3>');
      return;
    }
    res.redirect(`/survey.html?id=${realSurveyId}&link=${code}`);
  } catch (err) {
    console.error('[Gateway] shortlink redirect error:', err);
    res.status(500).send('服务器内部错误');
  }
});
