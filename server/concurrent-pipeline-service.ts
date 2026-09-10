/**
 * server/concurrent-pipeline-service.ts
 *
 * 多 Agent 并发问卷生成流水线核心服务
 *
 * 执行流程：
 * 1. Dispatcher Agent：将调研需求拆解为 4~6 个直接任务提示词（SurveyTaskPlan）
 * 2. Worker Agent 并发池：按并发度 <= 3 并发出题，题号带组块前缀（b1_1, b1_2），独立写入缓存
 * 3. 顺序装配与重排（Deterministic Re-indexing）：纯代码按顺序将题目平铺并映射为全局 q1..qN，平移块内跳转
 * 4. 拓扑安全校验与落盘（Fast Acyclic Guard -> DB）
 */

import OpenAI from 'openai';
import type {
  QuestionnaireModel,
  QuestionItemModel,
} from '../src/schema/questionnaire-schema-types';
import { ConfigService } from './config-service';
import { TemplateService } from './template-service';
import { LlmLogger } from './llm-logger';
import { AiGeneratorService } from './ai-generator-service';
import { generateSessionId } from './id-generator';

export interface SurveyTask {
  id: `b${number}`;
  count: number;
  prompt: string;
  status?: 'pending' | 'running' | 'done' | 'failed';
}

export interface SurveyTaskPlan {
  title: string;
  tasks: SurveyTask[];
}

export interface PipelineSession {
  surveyId: string;
  title: string;
  createdAt: number;
  tasks: SurveyTask[];
  blockResults: Map<string, QuestionItemModel[]>;
}

export type ConcurrentPipelineEvent =
  | { type: 'plan_ready'; plan: SurveyTaskPlan }
  | { type: 'block_progress'; blockId: string; questions: QuestionItemModel[]; completed: number; total: number }
  | { type: 'survey_ready'; survey: QuestionnaireModel; surveyId: string }
  | { type: 'error'; error: string; blockId?: string };

export class ConcurrentPipelineService {
  private static sessions = new Map<string, PipelineSession>();

  private static getOpenAI(): { client: OpenAI; model: string } {
    const config = ConfigService.getConfig();
    if (!config.apiKey || !config.model) {
      throw new Error('AI 模型未配置或 API 密钥缺失。请先在控制台右上角「设置」中配置有效的 API Key 与 Model 名称。');
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      timeout: 300000,
      maxRetries: 2,
    });

    return { client, model: config.model };
  }

  /**
   * 阶段一：Dispatcher Agent 任务拆解
   * 直接生成各组块的执行提示词（Sub-Prompts）
   */
  public static async planTasks(params: {
    prompt: string;
    targetCount?: number;
    documentText?: string;
    templateIds?: string[];
  }): Promise<SurveyTaskPlan> {
    const ai = this.getOpenAI();
    const targetCount = Math.max(4, Math.min(80, params.targetCount || 10));
    const relevantDoc = params.documentText ? params.documentText.slice(0, 25000) : '';
    const templateContext = TemplateService.formatTemplatesForPrompt(params.templateIds);

    const systemPrompt = `你是一位调研设计架构师。请根据用户的调研诉求，将问卷拆解为 4~6 个并发子任务。
你必须为每个任务直接编写清晰、明确的出题提示词（prompt），指明核心考点与禁止涉及的内容，杜绝子任务之间撞题。

输出要求：
必须直接输出纯 JSON，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "title": "问卷标题",
  "tasks": [
    {
      "id": "b1",
      "count": 4,
      "prompt": "考察用户的个人身份与核心使用场景，不要涉及具体功能打分与竞品对比。"
    }
  ]
}

契约约束：
1. 每个 task 的 id 严格为 b1, b2, b3... 顺序递增。
2. prompt 必须为直接给子 Agent 的出题指令，严禁添加多余描述性套话。`;

    const userPrompt = [
      `调研诉求：${params.prompt || '用户综合体验与满意度调研'}`,
      `目标题数：约 ${targetCount} 题`,
      relevantDoc ? `参考资料：\n${relevantDoc}` : '',
      templateContext ? `参考逻辑模板：\n${templateContext}` : '',
      '请直接输出符合契约的纯 JSON 任务计划数据：',
    ].filter(Boolean).join('\n\n');

    const response = await LlmLogger.callAndLog(
      'Dispatcher Agent: 任务拆解 (planTasks)',
      ai,
      {
        model: ai.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { targetCount, templateIds: params.templateIds }
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('模型未返回有效任务计划数据');
    }

    const parsed = AiGeneratorService.extractAndParseJson<any>(raw, null);
    if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      throw new Error('模型返回的任务列表为空或格式无法解析');
    }

    const tasks: SurveyTask[] = parsed.tasks.map((t: any, idx: number) => ({
      id: `b${idx + 1}` as `b${number}`,
      count: Math.max(1, Math.min(20, Number(t.count) || 3)),
      prompt: String(t.prompt || `负责该维度调研题目生成`),
      status: 'pending',
    }));

    return {
      title: String(parsed.title || params.prompt || '调研问卷').trim(),
      tasks,
    };
  }

  /**
   * 阶段二：Worker Agent 独立生成单个组块题目
   * 题号统一使用命名空间 bK_1, bK_2
   */
  public static async generateWorkerChunk(params: {
    blockId: `b${number}`;
    count: number;
    prompt: string;
  }): Promise<QuestionItemModel[]> {
    const ai = this.getOpenAI();
    const count = Math.max(1, Math.min(30, params.count || 3));
    const blockId = params.blockId;

    const systemPrompt = `你是一位调研题目设计专家。请根据指定的出题指令生成题目列表。
必须直接输出符合契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

顶级结构：
{
  "questions": []
}

题型规范：
1. single_choice (单选题):
   { "id": "${blockId}_1", "type": "single_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

2. multiple_choice (多选题):
   { "id": "${blockId}_1", "type": "multiple_choice", "title": string, "options": string[], "jump"?: IntraBlockJumpRule[] }

3. likert_scale (量表题/矩阵评分):
   { "id": "${blockId}_1", "type": "likert_scale", "title": string, "options": string[], "statements": string[], "jump"?: IntraBlockJumpRule[] }
   - options 为评分刻度（列），statements 为评价条目（行），二者必须同时具备。

4. text_input (填空题):
   { "id": "${blockId}_1", "type": "text_input", "title": string, "placeholder"?: string }

约束：
- 题号必须严格带有当前组块前缀并顺序递增，如 ${blockId}_1, ${blockId}_2, ${blockId}_3...
- 默认自然顺延。若配置 jump，仅允许在本组块内向后跳转或指向 "exit" / "end"，严禁跨组块跳转。`;

    const userPrompt = [
      `出题指令：${params.prompt}`,
      `生成题量：${count} 题（题号前缀为 ${blockId}_*）`,
      '请直接输出符合契约的纯 JSON 题目列表：',
    ].join('\n\n');

    const response = await LlmLogger.callAndLog(
      `Worker Agent [${blockId}]: 组块出题`,
      ai,
      {
        model: ai.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { blockId, count }
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error(`Worker [${blockId}] 未返回有效题目数据`);
    }

    const parsed = AiGeneratorService.extractAndParseJson<any>(raw, null);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error(`Worker [${blockId}] 返回的题目列表为空或无法解析`);
    }

    // 题目数据清洗与静默补齐
    const questions: QuestionItemModel[] = parsed.questions.map((q: any, idx: number) => {
      const type = q.type || 'single_choice';
      const questionId = `${blockId}_${idx + 1}`;
      let options = Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === 'string' && o.trim()) : undefined;

      if ((type === 'single_choice' || type === 'multiple_choice') && (!options || options.length < 2)) {
        options = ['选项 A', '选项 B'];
      }

      let statements = Array.isArray(q.statements) ? q.statements.filter((s: any) => typeof s === 'string' && s.trim()) : undefined;
      if (type === 'likert_scale') {
        if (!options || options.length === 0) options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
        if (!statements || statements.length === 0) statements = ['整体评价'];
      }

      return {
        id: questionId,
        type,
        title: String(q.title || `题目 ${idx + 1}`).trim(),
        options: type === 'text_input' ? undefined : options,
        statements: type === 'likert_scale' ? statements : undefined,
        placeholder: type === 'text_input' ? (q.placeholder || '请输入您的回答...') : undefined,
        required: q.required !== false,
        jump: q.jump,
      };
    });

    return questions;
  }

  /**
   * 阶段三：顺序装配与全局题号重排 (Deterministic Re-indexing)
   * 纯代码将 b1_1, b2_1 映射为全局连续的 q1, q2...，并自动平移内部跳转边
   */
  public static assembleQuestions(
    tasks: SurveyTask[],
    blockResults: Map<string, QuestionItemModel[]>
  ): QuestionItemModel[] {
    const rawOrderedQuestions: QuestionItemModel[] = [];
    const idMap = new Map<string, string>(); // "b1_1" -> "q1"

    let globalIndex = 1;
    for (const task of tasks) {
      const blockQs = blockResults.get(task.id) || [];
      for (const q of blockQs) {
        const globalId = `q${globalIndex++}`;
        idMap.set(q.id, globalId);
        rawOrderedQuestions.push({ ...q });
      }
    }

    // 批量平移题目自身 ID 与块内跳转引用
    const assembled: QuestionItemModel[] = rawOrderedQuestions.map((q) => {
      const newId = idMap.get(q.id) || q.id;
      let newJump = q.jump;

      if (Array.isArray(q.jump)) {
        newJump = q.jump.map((rule: any) => {
          const target = rule.to ? String(rule.to).trim() : '';
          const translatedTo = idMap.get(target) || target;
          let translatedWhen = rule.when;

          if (rule.when && typeof rule.when === 'object') {
            translatedWhen = {};
            for (const [key, val] of Object.entries(rule.when)) {
              const mappedKey = idMap.get(key) || key;
              translatedWhen[mappedKey] = val;
            }
          }

          return {
            ...rule,
            to: translatedTo,
            when: translatedWhen,
          };
        });
      }

      return {
        ...q,
        id: newId,
        jump: newJump,
      };
    });

    // 拓扑防环守卫与未引用变量清理
    const safeQuestions = AiGeneratorService.fastAcyclicGuard(assembled);
    return AiGeneratorService.cleanUnusedVariables(safeQuestions);
  }

  /**
   * 执行完整的并发流水线
   * Dispatcher -> Worker 并发池 (<= 3) -> 缓存 -> 顺序装配 -> 交付
   */
  public static async executeConcurrentPipeline(
    params: {
      prompt: string;
      targetCount?: number;
      documentText?: string;
      templateIds?: string[];
      enableJumpLogic?: boolean;
    },
    onEvent: (event: ConcurrentPipelineEvent) => void
  ): Promise<QuestionnaireModel> {
    const sessionId = generateSessionId();

    // 1. Dispatcher 拆解任务
    const plan = await this.planTasks(params);
    onEvent({ type: 'plan_ready', plan });

    const session: PipelineSession = {
      surveyId: sessionId,
      title: plan.title,
      createdAt: Date.now(),
      tasks: plan.tasks,
      blockResults: new Map(),
    };
    this.sessions.set(sessionId, session);

    // 2. 并发池调度器 (限制最大 3 个并行 Worker)
    const concurrencyLimit = 3;
    let completedCount = 0;
    const totalCount = plan.tasks.length;

    // 轻量并发队列
    const runWorkerWithRetry = async (task: SurveyTask): Promise<QuestionItemModel[]> => {
      task.status = 'running';
      try {
        const questions = await this.generateWorkerChunk({
          blockId: task.id,
          count: task.count,
          prompt: task.prompt,
        });
        task.status = 'done';
        return questions;
      } catch (err: any) {
        console.warn(`[ConcurrentPipeline] Worker [${task.id}] 首次生成失败，正在重试:`, err?.message);
        // 重试 1 次
        try {
          const questions = await this.generateWorkerChunk({
            blockId: task.id,
            count: task.count,
            prompt: task.prompt,
          });
          task.status = 'done';
          return questions;
        } catch (retryErr: any) {
          task.status = 'failed';
          throw new Error(`Worker [${task.id}] 最终生成失败: ${retryErr?.message || '模型错误'}`);
        }
      }
    };

    // 并发池调度
    let taskQueueIndex = 0;
    const workers = Array.from({ length: Math.min(concurrencyLimit, plan.tasks.length) }, async () => {
      while (taskQueueIndex < plan.tasks.length) {
        const currentTask = plan.tasks[taskQueueIndex++];
        try {
          const questions = await runWorkerWithRetry(currentTask);
          session.blockResults.set(currentTask.id, questions);
          completedCount++;
          onEvent({
            type: 'block_progress',
            blockId: currentTask.id,
            questions,
            completed: completedCount,
            total: totalCount,
          });
        } catch (err: any) {
          onEvent({
            type: 'error',
            error: err?.message || `组块 ${currentTask.id} 生成失败`,
            blockId: currentTask.id,
          });
        }
      }
    });

    await Promise.all(workers);

    // 3. 顺序组装与全局重排
    const finalQuestions = this.assembleQuestions(plan.tasks, session.blockResults);
    const finalSurvey: QuestionnaireModel = {
      title: plan.title,
      description: `基于多 Agent 并发流水线智造。`,
      questions: finalQuestions,
    };

    onEvent({
      type: 'survey_ready',
      survey: finalSurvey,
      surveyId: sessionId,
    });

    // 延迟清除缓存会话 (5 分钟)
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5 * 60 * 1000);

    return finalSurvey;
  }

  public static getSession(sessionId: string): PipelineSession | undefined {
    return this.sessions.get(sessionId);
  }
}
