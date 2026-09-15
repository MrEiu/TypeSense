/**
 * server/routes/ai.ts
 *
 * AI-assisted survey generation, conversational filler, and model configuration endpoints.
 */

import { Router, Request, Response } from 'express';
import { SurveyService } from '../survey-service';
import { DocumentService } from '../document-service';
import { AiGeneratorService } from '../ai-generator-service';
import { ConcurrentPipelineService } from '../concurrent-pipeline-service';
import { ConfigService } from '../config-service';
import { AiChatFillerService } from '../ai-chat-filler-service';
import type { QuestionnaireModel, QuestionItemModel } from '../../src/schema/questionnaire-schema-types';

export const aiRouter = Router();

/**
 * AI conversational filler for questionnaire prefilling
 */
aiRouter.post('/api/surveys/:id/ai-chat-fill', async (req: Request, res: Response) => {
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
    console.error('[API] ai-chat-fill error:', err);
    res.status(500).json({ success: false, error: err.message || 'AI 对话服务处理异常' });
  }
});

/**
 * SSE streaming questionnaire generation pipeline
 */
aiRouter.post('/api/ai/generate-stream', async (req: Request, res: Response) => {
  const { documentId, prompt, targetCount, enableJumpLogic, templateIds, templateId } = req.body || {};
  const activeTemplateIds = Array.isArray(templateIds)
    ? templateIds
    : templateId
    ? [templateId]
    : undefined;

  // 1. Disable socket timeout, enable TCP Keep-Alive
  req.socket.setTimeout(0);
  req.socket.setKeepAlive(true);

  // 2. Set standard SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let isClosed = false;

  // 3. Heartbeat keepalive every 3 seconds
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
      console.warn('[SSE] write data error:', err);
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

    // Auto-save generated survey
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
    console.error('[API] generate-stream error:', err);
    sendEvent({ type: 'error', error: err?.message || '生成失败' });
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } finally {
    cleanup();
  }
});

/**
 * Direct lean survey generation
 */
aiRouter.post('/api/ai/generate-direct', async (req: Request, res: Response) => {
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

    // Auto-save generated survey
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
    console.error('[API] generate-direct error:', err);
    res.status(500).json({ success: false, error: err?.message || '生成问卷失败' });
  }
});

/**
 * Plan blueprint and task chunking (Stage 1 / Dispatcher)
 */
aiRouter.post('/api/ai/plan-blueprint', async (req: Request, res: Response) => {
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
    console.error('[API] plan-blueprint error:', err);
    res.status(500).json({ success: false, error: err?.message || '规划全景任务失败' });
  }
});

/**
 * Generate questions for a single chunk block (Stage 2 / Worker Agent)
 */
aiRouter.post('/api/ai/generate-chunk', async (req: Request, res: Response) => {
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
    console.error('[API] generate-chunk error:', err);
    res.status(500).json({ success: false, error: err?.message || '生成组块题目失败' });
  }
});

/**
 * Assemble questions, acyclic check, and persist to store
 */
aiRouter.post('/api/ai/finalize-survey', async (req: Request, res: Response) => {
  try {
    const { title, description, questions, slug } = req.body || {};
    if (!title || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ success: false, error: '问卷标题与题目列表不能为空' });
      return;
    }

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
    console.error('[API] finalize-survey error:', err);
    res.status(500).json({ success: false, error: err?.message || '持久化问卷失败' });
  }
});

/**
 * Get current AI model configuration (API Key masked)
 */
aiRouter.get('/api/ai/config', (_req: Request, res: Response) => {
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
    console.error('[API] getConfig error:', err);
    res.status(500).json({ error: '获取模型配置失败' });
  }
});

/**
 * Save AI model configuration
 */
aiRouter.post('/api/ai/config', (req: Request, res: Response) => {
  try {
    const { baseURL, apiKey, model } = req.body || {};
    const current = ConfigService.getConfig();
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
    console.error('[API] saveConfig error:', err);
    res.status(500).json({ error: '保存模型配置失败' });
  }
});

/**
 * Dynamically discover available models from upstream provider
 */
aiRouter.post('/api/ai/models', async (req: Request, res: Response) => {
  try {
    const { baseURL, apiKey } = req.body || {};
    const models = await ConfigService.fetchAvailableModels({
      baseURL,
      apiKey: apiKey && !apiKey.includes('****') ? apiKey : undefined,
    });
    res.json({ success: true, models });
  } catch (err: any) {
    console.error('[API] fetchAvailableModels error:', err);
    res.status(400).json({ success: false, error: err?.message || '获取模型列表失败' });
  }
});
