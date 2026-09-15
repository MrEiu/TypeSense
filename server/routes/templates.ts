/**
 * server/routes/templates.ts
 *
 * Survey logic flow template discovery endpoints.
 */

import { Router, Request, Response } from 'express';
import { TemplateService } from '../template-service';

export const templatesRouter = Router();

/**
 * List all available logic flow templates
 */
templatesRouter.get('/api/ai/logic-templates', (_req: Request, res: Response) => {
  try {
    const templates = TemplateService.listTemplates();
    res.json({ success: true, templates });
  } catch (err: any) {
    console.error('[API] listTemplates error:', err);
    res.status(500).json({ success: false, error: err?.message || '获取逻辑模板失败' });
  }
});
