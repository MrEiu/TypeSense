/**
 * server/server.ts
 *
 * 独立后端 HTTP 服务入口
 * 职责：提供 REST API（问卷 CRUD、答卷存盘）以及短链重定向网关，持久化依托原生 SQLite。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.removeAllListeners('warning');
import { execSync } from 'node:child_process';
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { SurveyService } from './survey-service';
import { ResponseService } from './response-service';
import { DocumentService } from './document-service';
import { AiGeneratorService } from './ai-generator-service';
import { ConcurrentPipelineService } from './concurrent-pipeline-service';
import { ConfigService } from './config-service';
import { TemplateService } from './template-service';
import { AuthService, DEFAULT_ADMINS } from './auth-service';
import { aiEditorRouter } from './questionnaire-ai-editor/routes';
import { AiChatFillerService } from './ai-chat-filler-service';
import type { QuestionnaireModel } from '../src/schema/questionnaire-schema-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT_FILE = path.resolve(__dirname, '../data/server-port.json');
const DEFAULT_PORT = Number(process.env.PORT) || 3125;

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 初始化种子问卷与默认管理员账号
SurveyService.initSeedSurveys();
AuthService.initAdminAccounts();

// 挂载 AI 问卷局部编辑接口
app.use('/api/ai-editor', aiEditorRouter);

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
 * 更新问卷定义与题目 Schema (工作台编辑保存)
 */
app.put('/api/surveys/:id', (req: Request, res: Response) => {
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
    console.error('[API] updateSurvey 异常:', err);
    res.status(500).json({ error: '更新问卷失败' });
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

/**
 * 更新问卷收集状态（开启/暂停）
 */
app.patch('/api/surveys/:id/status', (req: Request, res: Response) => {
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
    console.error('[API] updateSurveyStatus 异常:', err);
    res.status(500).json({ error: '更新问卷状态失败' });
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
    console.error('[API] saveResponse 异常:', err);
    res.status(500).json({ error: '答卷入库失败' });
  }
});

/**
 * AI 自然对话辅助填写问卷
 */
app.post('/api/surveys/:id/ai-chat-fill', async (req: Request, res: Response) => {
  try {
    const surveyId = req.params.id;
    const surveyRaw = SurveyService.getSurvey(surveyId);
    if (!surveyRaw) {
      res.status(404).json({ success: false, error: '问卷不存在或已下架' });
      return;
    }

    const survey = surveyRaw as unknown as QuestionnaireModel;
    const { currentAnswers = {}, messages = [] } = req.body || {};

    const result = await AiChatFillerService.chatAndExtract({
      survey,
      currentAnswers,
      messages,
    });

    res.json(result);
  } catch (err: any) {
    console.error('[API] ai-chat-fill 异常:', err);
    res.status(500).json({ success: false, error: err.message || 'AI 对话服务处理异常' });
  }
});

// ==================== 账户认证与授权接口 ====================

/**
 * 账号密码登录
 */
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    const result = AuthService.login(username, password);
    if (!result.success) {
      res.status(401).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, user: result.user, token: result.token });
  } catch (err: any) {
    console.error('[API] login 异常:', err);
    res.status(500).json({ success: false, error: '登录处理异常' });
  }
});

/**
 * 普通成员自主注册
 */
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    const result = AuthService.register(username, password);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, user: result.user, token: result.token });
  } catch (err: any) {
    console.error('[API] register 异常:', err);
    res.status(500).json({ success: false, error: '注册处理异常' });
  }
});

/**
 * 获取当前登录用户信息
 */
app.get('/api/auth/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query.token as string);

    if (!token) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const user = AuthService.verifyToken(token);
    if (!user) {
      res.status(401).json({ success: false, error: '会话已过期或无效' });
      return;
    }

    res.json({ success: true, user });
  } catch (err: any) {
    console.error('[API] auth/me 异常:', err);
    res.status(500).json({ success: false, error: '会话校验失败' });
  }
});

/**
 * 获取系统默认管理员提示信息（用于辅助提示）
 */
app.get('/api/auth/default-admins', (_req: Request, res: Response) => {
  res.json({
    success: true,
    admins: DEFAULT_ADMINS.map((a) => ({
      username: a.username,
      defaultPassword: a.defaultPassword,
      description: a.description,
    })),
  });
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

// ==================== 知识库文档管理接口 ====================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 最大 30MB
});

/**
 * 上传知识库文档 (PDF, Word docx, Markdown, TXT)
 */
app.post('/api/documents/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '请选择要上传的文件' });
      return;
    }
    const doc = await DocumentService.processUpload({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    res.status(201).json({ success: true, document: doc });
  } catch (err: any) {
    console.error('[API] uploadDocument 异常:', err);
    res.status(500).json({ error: err?.message || '文档上传与解析失败' });
  }
});

/**
 * 获取所有已上传知识文档列表
 */
app.get('/api/documents', (_req: Request, res: Response) => {
  try {
    const list = DocumentService.listDocuments();
    res.json(list);
  } catch (err) {
    console.error('[API] listDocuments 异常:', err);
    res.status(500).json({ error: '获取文档列表失败' });
  }
});

/**
 * 获取单个文档详情
 */
app.get('/api/documents/:id', (req: Request, res: Response) => {
  try {
    const doc = DocumentService.getDocument(req.params.id);
    if (!doc) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    res.json(doc);
  } catch (err) {
    console.error('[API] getDocument 异常:', err);
    res.status(500).json({ error: '获取文档详情失败' });
  }
});

/**
 * 删除文档
 */
app.delete('/api/documents/:id', (req: Request, res: Response) => {
  try {
    const success = DocumentService.deleteDocument(req.params.id);
    res.json({ success });
  } catch (err) {
    console.error('[API] deleteDocument 异常:', err);
    res.status(500).json({ error: '删除文档失败' });
  }
});

// ==================== AI 智能问卷生成与逻辑模板接口 ====================

/**
 * 获取所有可用的逻辑流转模板 (动态扫描 data/logic-templates 目录)
 */
app.get('/api/ai/logic-templates', (_req: Request, res: Response) => {
  try {
    const templates = TemplateService.listTemplates();
    res.json({ success: true, templates });
  } catch (err: any) {
    console.error('[API] listTemplates 异常:', err);
    res.status(500).json({ success: false, error: err?.message || '获取逻辑模板失败' });
  }
});

/**
 * SSE 流式生成问卷 (双阶渐进式智能体流水线)
 */
app.post('/api/ai/generate-stream', async (req: Request, res: Response) => {
  const { documentId, prompt, targetCount, enableJumpLogic, templateIds, templateId } = req.body || {};
  const activeTemplateIds = Array.isArray(templateIds)
    ? templateIds
    : templateId
    ? [templateId]
    : undefined;

  // 1. 禁用底层 Socket 超时，启用 TCP Keep-Alive
  req.socket.setTimeout(0);
  req.socket.setKeepAlive(true);

  // 2. 设置标准 SSE 响应头，禁用代理缓冲
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let isClosed = false;

  // 3. 定时心跳保活机制 (每 3 秒发送一次 SSE 注释帧，彻底消除 ECONNRESET)
  const heartbeatTimer = setInterval(() => {
    if (isClosed || res.writableEnded) return;
    try {
      res.write(': keepalive\n\n');
    } catch {
      cleanup();
    }
  }, 3000);

  const cleanup = () => {
    if (!isClosed) {
      isClosed = true;
      clearInterval(heartbeatTimer);
    }
  };

  req.on('close', cleanup);
  res.on('finish', cleanup);
  res.on('error', cleanup);

  const sendEvent = (event: any) => {
    if (isClosed || res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      console.warn('[SSE] 写入数据异常:', err);
      cleanup();
    }
  };

  try {
    let documentText = '';
    if (documentId) {
      const doc = DocumentService.getDocument(documentId);
      if (doc) {
        documentText = doc.extractedText;
      }
    }

    const userPrompt = (prompt || '').trim();
    if (!userPrompt && !documentText) {
      sendEvent({ type: 'error', error: '请提供问卷调研诉求或选择知识库文档' });
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
      cleanup();
      return;
    }

    const generatedSurvey = await ConcurrentPipelineService.executeConcurrentPipeline(
      {
        prompt: userPrompt,
        targetCount: Number(targetCount) || 8,
        documentText,
        templateIds: activeTemplateIds,
        enableJumpLogic: enableJumpLogic !== false,
      },
      (event) => {
        sendEvent(event);
      }
    );

    // 自动保存进正式问卷库
    const saved = SurveyService.createSurvey({
      title: generatedSurvey.title,
      description: generatedSurvey.description,
      schema: generatedSurvey as any,
    });

    sendEvent({
      type: 'persisted',
      surveyId: saved.id,
      slug: saved.slug,
      accessUrl: `/survey.html?id=${saved.id}`,
      canvasUrl: `/admin.html?id=${saved.id}`,
    });

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err: any) {
    console.error('[API] generate-stream 异常:', err);
    sendEvent({ type: 'error', error: err?.message || '生成失败' });
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } finally {
    cleanup();
  }
});

// ==================== 极简极速直出与组块协同端点 ====================

/**
 * 极简极速直出全卷 (Direct Lean Survey Generation)
 */
app.post('/api/ai/generate-direct', async (req: Request, res: Response) => {
  try {
    const { prompt, documentId, targetCount, enableJumpLogic, templateIds, templateId } = req.body || {};
    const activeTemplateIds = Array.isArray(templateIds)
      ? templateIds
      : templateId
      ? [templateId]
      : undefined;

    let documentText = '';
    if (documentId) {
      const doc = DocumentService.getDocument(documentId);
      if (doc) documentText = doc.extractedText;
    }

    const trimmedPrompt = (prompt || '').trim();
    if (!trimmedPrompt && !documentText) {
      res.status(400).json({ error: '请提供问卷调研诉求或选择知识库文档' });
      return;
    }

    const survey = await AiGeneratorService.generateDirectSurvey({
      prompt: trimmedPrompt,
      documentId,
      documentText,
      templateIds: activeTemplateIds,
      targetCount: Number(targetCount) || 8,
      enableJumpLogic: enableJumpLogic !== false,
    });

    // 自动保存进正式问卷库
    const saved = SurveyService.createSurvey({
      title: survey.title,
      description: survey.description,
      schema: survey as any,
    });

    res.json({
      success: true,
      survey,
      saved: {
        id: saved.id,
        slug: saved.slug,
        accessUrl: `/survey.html?id=${saved.id}`,
        canvasUrl: `/admin.html?id=${saved.id}`,
      },
    });
  } catch (err: any) {
    console.error('[API] generate-direct 异常:', err);
    res.status(500).json({ success: false, error: err?.message || '生成问卷失败' });
  }
});

/**
 * 规划全景任务计划与题组块 (Stage 1 / Dispatcher)
 */
app.post('/api/ai/plan-blueprint', async (req: Request, res: Response) => {
  try {
    const { prompt, documentId, targetCount, templateIds, templateId } = req.body || {};
    const activeTemplateIds = Array.isArray(templateIds)
      ? templateIds
      : templateId
      ? [templateId]
      : undefined;

    let documentText = '';
    if (documentId) {
      const doc = DocumentService.getDocument(documentId);
      if (doc) documentText = doc.extractedText;
    }

    const taskPlan = await ConcurrentPipelineService.planTasks({
      prompt: (prompt || '').trim(),
      targetCount: Number(targetCount) || 8,
      documentText,
      templateIds: activeTemplateIds,
    });

    const blueprint = {
      title: taskPlan.title,
      description: `基于并发多任务拆解智造。`,
      tasks: taskPlan.tasks,
      blocks: taskPlan.tasks.map((t) => ({
        id: t.id,
        name: t.prompt.slice(0, 24),
        description: t.prompt,
        prompt: t.prompt,
        questionCount: t.count,
      })),
    };

    res.json({ success: true, blueprint, taskPlan });
  } catch (err: any) {
    console.error('[API] plan-blueprint 异常:', err);
    res.status(500).json({ success: false, error: err?.message || '规划全景任务失败' });
  }
});

/**
 * 单组块题目生成 (Stage 2 / Worker Agent)
 */
app.post('/api/ai/generate-chunk', async (req: Request, res: Response) => {
  try {
    const { block, refinePrompt } = req.body || {};
    const blockId = (block?.id || 'b1') as `b${number}`;
    const count = Number(block?.questionCount || block?.count) || 3;
    const taskPrompt = String(block?.prompt || block?.description || refinePrompt || '负责该维度调研题目生成');

    const questions = await ConcurrentPipelineService.generateWorkerChunk({
      blockId,
      count,
      prompt: taskPrompt,
    });

    res.json({ success: true, questions, blockId });
  } catch (err: any) {
    console.error('[API] generate-chunk 异常:', err);
    res.status(500).json({ success: false, error: err?.message || '生成组块题目失败' });
  }
});

/**
 * 全卷组装、有向图防环校验并持久化入库
 */
app.post('/api/ai/finalize-survey', async (req: Request, res: Response) => {
  try {
    const { title, description, questions, slug } = req.body || {};
    if (!title || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ success: false, error: '问卷标题与题目列表不能为空' });
      return;
    }

    // 检查是否包含带组块前缀的局部题号 (如 b1_1)，若有则执行确定性重排
    let safeQuestions: QuestionItemModel[] = [];
    const hasBlockPrefix = questions.some((q) => /^[a-z]\d+_\d+/i.test(q.id));
    if (hasBlockPrefix) {
      const blockIdSet = new Set<string>();
      questions.forEach((q) => {
        const m = q.id.match(/^([a-z]\d+)_\d+/i);
        if (m) blockIdSet.add(m[1]);
      });
      const dummyTasks = Array.from(blockIdSet).map((id) => ({
        id: id as `b${number}`,
        count: 0,
        prompt: '',
      }));
      const blockMap = new Map<string, QuestionItemModel[]>();
      questions.forEach((q) => {
        const m = q.id.match(/^([a-z]\d+)_\d+/i);
        const blockId = m ? m[1] : 'b1';
        if (!blockMap.has(blockId)) blockMap.set(blockId, []);
        blockMap.get(blockId)!.push(q);
      });
      safeQuestions = ConcurrentPipelineService.assembleQuestions(dummyTasks, blockMap);
    } else {
      safeQuestions = AiGeneratorService.cleanUnusedVariables(
        AiGeneratorService.fastAcyclicGuard(questions)
      );
    }

    const saved = SurveyService.createSurvey({
      title,
      description: description || '基于 AI 智能体组块协同工坊生成。',
      slug,
      schema: {
        title,
        description: description || '',
        questions: safeQuestions,
      },
    });

    res.json({
      success: true,
      surveyId: saved.id,
      slug: saved.slug,
      accessUrl: `/survey.html?id=${saved.id}`,
      canvasUrl: `/admin.html?id=${saved.id}`,
      questions: safeQuestions,
    });
  } catch (err: any) {
    console.error('[API] finalize-survey 异常:', err);
    res.status(500).json({ success: false, error: err?.message || '持久化问卷失败' });
  }
});

// ==================== 模型配置与动态发现接口 (零预设) ====================

/**
 * 获取当前模型配置 (出于安全考虑，API Key 仅暴露掩码信息)
 */
app.get('/api/ai/config', (_req: Request, res: Response) => {
  try {
    const config = ConfigService.getConfig();
    const maskedApiKey = config.apiKey
      ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}`
      : '';
    res.json({
      baseURL: config.baseURL,
      apiKeyMasked: maskedApiKey,
      hasApiKey: !!config.apiKey,
      model: config.model,
    });
  } catch (err: any) {
    console.error('[API] getConfig 异常:', err);
    res.status(500).json({ error: '获取模型配置失败' });
  }
});

/**
 * 保存模型配置
 */
app.post('/api/ai/config', (req: Request, res: Response) => {
  try {
    const { baseURL, apiKey, model } = req.body || {};
    const current = ConfigService.getConfig();
    // 若 apiKey 未填写或传入的是掩码，则沿用已有密钥
    const newApiKey =
      apiKey && !apiKey.includes('****') ? apiKey.trim() : current.apiKey;

    const saved = ConfigService.saveConfig({
      baseURL: baseURL !== undefined ? baseURL : current.baseURL,
      apiKey: newApiKey,
      model: model !== undefined ? model : current.model,
    });

    res.json({
      success: true,
      baseURL: saved.baseURL,
      apiKeyMasked: saved.apiKey ? `${saved.apiKey.slice(0, 4)}****${saved.apiKey.slice(-4)}` : '',
      hasApiKey: !!saved.apiKey,
      model: saved.model,
    });
  } catch (err: any) {
    console.error('[API] saveConfig 异常:', err);
    res.status(500).json({ error: '保存模型配置失败' });
  }
});

/**
 * 动态获取可用模型列表 (零预设，直接向服务商接口拉取)
 */
app.post('/api/ai/models', async (req: Request, res: Response) => {
  try {
    const { baseURL, apiKey } = req.body || {};
    const models = await ConfigService.fetchAvailableModels({
      baseURL,
      apiKey: apiKey && !apiKey.includes('****') ? apiKey : undefined,
    });
    res.json({ success: true, models });
  } catch (err: any) {
    console.error('[API] fetchAvailableModels 异常:', err);
    res.status(400).json({ success: false, error: err?.message || '获取模型列表失败' });
  }
});

function saveServerPort(port: number): void {
  try {
    const dir = path.dirname(PORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      PORT_FILE,
      JSON.stringify({ port, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (err) {
    console.warn('[TypeSense Backend] 保存 server-port.json 异常:', err);
  }
}

/**
 * 杀死占用指定端口的冲突进程
 */
async function killPortProcess(port: number): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  let killed = false;

  try {
    if (isWindows) {
      // Windows: 通过 netstat 查找监听目标端口的进程 PID
      const output = execSync('netstat -ano -p tcp', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = output.split('\n');
      const pids = new Set<number>();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        // TCP 0.0.0.0:3125 ... LISTENING 1234
        if (parts.length >= 5 && parts[3]?.toUpperCase() === 'LISTENING') {
          const localAddr = parts[1] || '';
          if (localAddr.endsWith(`:${port}`)) {
            const pid = parseInt(parts[parts.length - 1], 10);
            if (pid && pid > 0 && pid !== process.pid) {
              pids.add(pid);
            }
          }
        }
      }

      for (const pid of pids) {
        try {
          console.warn(`[TypeSense Backend] 检测到端口 ${port} 被进程 (PID: ${pid}) 占用，正在强制终止释放端口...`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          killed = true;
          console.info(`[TypeSense Backend] 成功终止冲突进程 (PID: ${pid})`);
        } catch (e) {
          console.warn(`[TypeSense Backend] 终止进程 PID ${pid} 失败:`, e);
        }
      }
    } else {
      // Unix / Linux / macOS
      const output = execSync(`lsof -ti tcp:${port}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      if (output) {
        const pids = output
          .split('\n')
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => p && p !== process.pid);
        for (const pid of pids) {
          try {
            console.warn(`[TypeSense Backend] 检测到端口 ${port} 被进程 (PID: ${pid}) 占用，正在强制终止释放端口...`);
            process.kill(pid, 'SIGKILL');
            killed = true;
            console.info(`[TypeSense Backend] 成功终止冲突进程 (PID: ${pid})`);
          } catch (e) {
            console.warn(`[TypeSense Backend] 终止进程 PID ${pid} 失败:`, e);
          }
        }
      }
    }
  } catch {
    // 忽略查询命令异常
  }

  if (killed) {
    // 等待操作系统回收 Socket
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return killed;
}

const server = http.createServer(app);

async function startServer() {
  try {
    const targetPort = DEFAULT_PORT;
    // 启动前若检测到 3125 端口已被占用，自动杀死对应冲突进程
    await killPortProcess(targetPort);

    server.once('error', async (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[TypeSense Backend] 端口 ${targetPort} 检测到冲突 (EADDRINUSE)，正在自动强杀占用进程并重试绑定...`);
        await killPortProcess(targetPort);
        setTimeout(() => {
          server.listen(targetPort, '127.0.0.1');
        }, 300);
      } else {
        console.error('[TypeSense Backend] 服务启动异常:', err);
        process.exit(1);
      }
    });

    server.listen(targetPort, '127.0.0.1', () => {
      saveServerPort(targetPort);
    });
  } catch (err) {
    console.error('[TypeSense Backend] 服务启动失败:', err);
    process.exit(1);
  }
}

startServer();


