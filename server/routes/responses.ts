/**
 * server/routes/responses.ts
 *
 * Survey respondent submission and response record query endpoints.
 */

import { Router, Request, Response } from 'express';
import { ResponseService } from '../response-service';

export const responsesRouter = Router();

/**
 * Submit survey response
 */
responsesRouter.post('/api/surveys/:id/responses', (req: Request, res: Response) => {
  try {
    const { answers, status, linkCode, username, userId } = req.body || {};
    const result = ResponseService.saveResponse(req.params.id, {
      answers: answers || {},
      status: status || 'completed',
      linkCode,
      username,
      userId,
    });
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    console.error('[API] saveResponse error:', err);
    res.status(500).json({ error: '答卷入库失败' });
  }
});

/**
 * Query survey responses list
 */
responsesRouter.get('/api/surveys/:id/responses', (req: Request, res: Response) => {
  try {
    const list = ResponseService.listResponsesBySurvey(req.params.id);
    res.json(list);
  } catch (err) {
    console.error('[API] listResponses error:', err);
    res.status(500).json({ error: '获取答卷记录失败' });
  }
});
