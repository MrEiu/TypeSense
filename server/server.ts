/**
 * server/server.ts
 *
 * 独立后端 HTTP 服务入口
 * 职责：提供 REST API（问卷 CRUD、答卷存盘）以及短链重定向网关，持久化依托原生 SQLite。
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { SurveyService } from './survey-service';
import { ResponseService } from './response-service';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 初始化种子问卷
SurveyService.initSeedSurveys();

// ==================== 问卷管理接口 ====================

/**
 * 获取所有问卷列表
 */
app.get('/api/surveys', (_req: Request, res: Response) => {
  try {
    const list = SurveyService.listSurveys();
    res.json(list);
  } catch (err) {
    console.error('[API] listSurveys 异常:', err);
    res.status(500).json({ error: '无法获取问卷列表' });
  }
});

/**
 * 获取指定问卷完整定义 (支持算法 ID 或 Slug)
 */
app.get('/api/surveys/:id', (req: Request, res: Response) => {
  try {
    const survey = SurveyService.getSurvey(req.params.id);
    if (!survey) {
      res.status(404).json({ error: '问卷不存在' });
      return;
    }
    res.json(survey);
  } catch (err) {
    console.error('[API] getSurvey 异常:', err);
    res.status(500).json({ error: '无法读取问卷' });
  }
});

/**
 * 创建/发布新问卷 (算法自动生成唯一 ID)
 */
app.post('/api/surveys', (req: Request, res: Response) => {
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
    console.error('[API] createSurvey 异常:', err);
    res.status(500).json({ error: '创建问卷失败' });
  }
});

/**
 * 删除指定问卷
 */
app.delete('/api/surveys/:id', (req: Request, res: Response) => {
  try {
    const success = SurveyService.deleteSurvey(req.params.id);
    res.json({ success });
  } catch (err) {
    console.error('[API] deleteSurvey 异常:', err);
    res.status(500).json({ error: '删除问卷失败' });
  }
});

// ==================== 短链与访问网关 ====================

/**
 * 为问卷算法生成一个唯一访问短码
 */
app.post('/api/surveys/:id/links', (req: Request, res: Response) => {
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
    console.error('[API] createLink 异常:', err);
    res.status(500).json({ error: '生成访问短链失败' });
  }
});

/**
 * 短链访问重定向网关
 */
app.get('/s/:code', (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const realSurveyId = SurveyService.resolveLink(code);
    if (!realSurveyId) {
      res.status(404).send('<h3>404 - 无效或已失效的问卷访问链接</h3>');
      return;
    }
    // 302 重定向到前端受访端页面，携带真实算法生成的问卷 ID 及短码
    res.redirect(`/survey.html?id=${realSurveyId}&link=${code}`);
  } catch (err) {
    console.error('[Gateway] 短链跳转异常:', err);
    res.status(500).send('服务器内部错误');
  }
});

// ==================== 答卷提交与存盘 ====================

/**
 * 受访者提交答卷入库
 */
app.post('/api/surveys/:id/responses', (req: Request, res: Response) => {
  try {
    const { answers, status, linkCode } = req.body || {};
    const result = ResponseService.saveResponse(req.params.id, {
      answers: answers || {},
      status: status || 'completed',
      linkCode,
    });
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    console.error('[API] saveResponse 异常:', err);
    res.status(500).json({ error: '答卷入库失败' });
  }
});

/**
 * 查询指定问卷的答卷明细
 */
app.get('/api/surveys/:id/responses', (req: Request, res: Response) => {
  try {
    const list = ResponseService.listResponsesBySurvey(req.params.id);
    res.json(list);
  } catch (err) {
    console.error('[API] listResponses 异常:', err);
    res.status(500).json({ error: '获取答卷记录失败' });
  }
});

app.listen(PORT, () => {
  console.info(`[TypeSense Backend] 服务已启动，监听在 http://localhost:${PORT}`);
});
