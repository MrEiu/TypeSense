/**
 * server/server.ts
 *
 * 独立后端 HTTP 服务入口
 * 职责：提供 REST API（问卷 CRUD、答卷存盘）以及短链重定向网关，持久化依托原生 SQLite。
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { SurveyService } from './survey-service';
import { ResponseService } from './response-service';
import { DocumentService } from './document-service';
import { AiGeneratorService } from './ai-generator-service';
import { ConfigService } from './config-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT_FILE = path.resolve(__dirname, '../data/server-port.json');
const DEFAULT_PORT = Number(process.env.PORT) || 3001;

const app = express();

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

// ==================== AI 智能问卷生成流式接口 ====================

/**
 * SSE 流式生成问卷 (双阶渐进式智能体流水线)
 */
app.post('/api/ai/generate-stream', async (req: Request, res: Response) => {
  const { documentId, prompt, targetCount, enableJumpLogic } = req.body || {};

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

    const generatedSurvey = await AiGeneratorService.executePipeline(
      {
        documentId,
        documentText,
        prompt: userPrompt,
        targetCount: Number(targetCount) || 8,
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

// ==================== 组块化人机协同端点 (Block-by-Block AI Studio) ====================

/**
 * 规划全景蓝图与题组块 (Stage 1)
 */
app.post('/api/ai/plan-blueprint', async (req: Request, res: Response) => {
  try {
    const { prompt, documentId, targetCount } = req.body || {};
    let documentText = '';
    if (documentId) {
      const doc = DocumentService.getDocument(documentId);
      if (doc) documentText = doc.extractedText;
    }

    const blueprint = await AiGeneratorService.planBlueprint(
      (prompt || '').trim(),
      documentText,
      Number(targetCount) || 8
    );

    res.json({ success: true, blueprint });
  } catch (err: any) {
    console.error('[API] plan-blueprint 异常:', err);
    res.status(500).json({ success: false, error: err?.message || '规划全景蓝图失败' });
  }
});

/**
 * 单组块题目生成 (Stage 2 单步出题与重拟)
 */
app.post('/api/ai/generate-chunk', async (req: Request, res: Response) => {
  try {
    const { blueprint, block, existingQuestions, enableJumpLogic, refinePrompt, documentId } = req.body || {};
    if (!blueprint || !block) {
      res.status(400).json({ success: false, error: '缺少 blueprint 或 block 定义' });
      return;
    }

    let documentText = '';
    if (documentId) {
      const doc = DocumentService.getDocument(documentId);
      if (doc) documentText = doc.extractedText;
    }

    const questions = await AiGeneratorService.generateBlockQuestions({
      blueprint,
      block,
      existingQuestions: Array.isArray(existingQuestions) ? existingQuestions : [],
      enableJumpLogic: enableJumpLogic !== false,
      refinePrompt: (refinePrompt || '').trim(),
      documentText,
    });

    res.json({ success: true, questions, blockId: block.id });
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

    // 全局单遍有向图环路阻断
    const safeQuestions = AiGeneratorService.fastAcyclicGuard(questions);

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

function findAvailablePort(startPort: number, maxAttempts = 30): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let attempts = 0;

    const testNextPort = () => {
      if (attempts >= maxAttempts) {
        reject(new Error(`在端口范围 [${startPort}, ${port}] 内未找到可用端口`));
        return;
      }
      const tester = net.createServer();
      tester.unref();

      tester.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          attempts++;
          console.warn(`[TypeSense Backend] 端口 ${port} 已被占用，自动切换探测端口 ${port + 1}...`);
          port++;
          setImmediate(testNextPort);
        } else {
          reject(err);
        }
      });

      tester.once('listening', () => {
        tester.close(() => {
          resolve(port);
        });
      });

      tester.listen(port, '0.0.0.0');
    };

    testNextPort();
  });
}

const server = http.createServer(app);

async function startServer() {
  try {
    const availablePort = await findAvailablePort(DEFAULT_PORT);
    server.listen(availablePort, '0.0.0.0', () => {
      saveServerPort(availablePort);
      console.info(`[TypeSense Backend] 服务已就绪，正在监听:`);
      console.info(`  ➜ Local:   http://localhost:${availablePort}/`);
      console.info(`  ➜ IPv4:    http://127.0.0.1:${availablePort}/`);
      console.info(`  ➜ 端口配置已同步至 data/server-port.json`);
    });
  } catch (err) {
    console.error('[TypeSense Backend] 服务启动失败:', err);
    process.exit(1);
  }
}

startServer();


