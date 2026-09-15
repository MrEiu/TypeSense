/**
 * server/ai/generator/pipeline.ts
 *
 * Concurrent multi-agent survey generation pipeline.
 * - Dispatcher Agent: Deconstructs user intent into 4-6 parallel sub-tasks.
 * - Worker Pool: Concurrently generates questions (concurrency <= 3) with retry.
 * - Re-indexing Assembler: Flattens block questions and maps them to global q1..qN.
 */

import type {
  QuestionnaireModel,
  QuestionItemModel,
} from '../../../src/schema/questionnaire-schema-types';
import { LlmClientFactory } from '../shared/llm-client';
import { StructuredOutputParser } from '../shared/structured-output';
import { LlmLogger } from '../../llm-logger';
import { generateSessionId } from '../../id-generator';
import { GeneratorPromptBuilder } from './prompt-builder';
import { GeneratorContextBuilder } from './context-builder';
import { GeneratorResultParser, SurveyTaskItem } from './result-parser';

export interface SurveyTaskPlan {
  title: string;
  tasks: SurveyTaskItem[];
}

export interface PipelineSession {
  surveyId: string;
  title: string;
  createdAt: number;
  tasks: SurveyTaskItem[];
  blockResults: Map<string, QuestionItemModel[]>;
}

export type ConcurrentPipelineEvent =
  | { type: 'plan_ready'; plan: SurveyTaskPlan }
  | { type: 'block_progress'; blockId: string; questions: QuestionItemModel[]; completed: number; total: number }
  | { type: 'survey_ready'; survey: QuestionnaireModel; surveyId: string }
  | { type: 'error'; error: string; blockId?: string };

export class ConcurrentPipelineEngine {
  private static sessions = new Map<string, PipelineSession>();

  /**
   * Stage 1: Dispatcher Agent task planning
   */
  public static async planTasks(params: {
    prompt: string;
    targetCount?: number;
    documentText?: string;
    templateIds?: string[];
  }): Promise<SurveyTaskPlan> {
    const ai = LlmClientFactory.getClient(120000);
    const targetCount = Math.max(4, Math.min(80, params.targetCount || 10));
    const relevantDoc = GeneratorContextBuilder.truncateDocumentText(params.documentText);
    const templateContext = GeneratorContextBuilder.buildTemplateContext(params.templateIds);

    const systemPrompt = GeneratorPromptBuilder.buildDispatcherSystemPrompt();
    const userPrompt = GeneratorPromptBuilder.buildDispatcherUserPrompt(
      params.prompt,
      targetCount,
      relevantDoc,
      templateContext
    );

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

    const parsed = StructuredOutputParser.extractAndParseJson<any>(raw, null);
    if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      throw new Error('模型返回的任务列表为空或格式无法解析');
    }

    const tasks: SurveyTaskItem[] = parsed.tasks.map((t: any, idx: number) => ({
      id: `b${idx + 1}` as `b${number}`,
      count: Math.max(1, Math.min(20, Number(t.count) || 3)),
      prompt: String(t.prompt || t.description || '负责该维度调研题目生成').trim(),
      status: 'pending',
    }));

    return {
      title: String(parsed.title || params.prompt || '调研问卷').trim(),
      tasks,
    };
  }

  /**
   * Stage 2: Worker Agent question generation for a single block
   */
  public static async generateWorkerChunk(params: {
    blockId: `b${number}`;
    count: number;
    prompt: string;
  }): Promise<QuestionItemModel[]> {
    const ai = LlmClientFactory.getClient(120000);
    const count = Math.max(1, Math.min(30, params.count || 3));
    const blockId = params.blockId;

    const systemPrompt = GeneratorPromptBuilder.buildWorkerSystemPrompt(blockId);
    const userPrompt = GeneratorPromptBuilder.buildWorkerUserPrompt(params.prompt, count, blockId);

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

    const parsed = StructuredOutputParser.extractAndParseJson<any>(raw, null);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error(`Worker [${blockId}] 返回的题目列表为空或无法解析`);
    }

    return GeneratorResultParser.sanitizeWorkerQuestions(parsed.questions, blockId);
  }

  /**
   * Execute full concurrent pipeline
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

    // 1. Dispatcher plan tasks
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

    // 2. Concurrency pool (<= 3 workers)
    const concurrencyLimit = 3;
    let completedCount = 0;
    const totalCount = plan.tasks.length;

    const runWorkerWithRetry = async (task: SurveyTaskItem): Promise<QuestionItemModel[]> => {
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
        console.warn(`[ConcurrentPipeline] Worker [${task.id}] first attempt failed, retrying:`, err?.message);
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
          throw new Error(`Worker [${task.id}] final failure: ${retryErr?.message || 'model error'}`);
        }
      }
    };

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

    // 3. Assemble and re-index questions
    const finalQuestions = GeneratorResultParser.assembleQuestions(plan.tasks, session.blockResults);
    const finalSurvey: QuestionnaireModel = {
      id: sessionId,
      title: plan.title,
      description: `基于多 Agent 并发流水线智造。`,
      questions: finalQuestions,
    };

    onEvent({
      type: 'survey_ready',
      survey: finalSurvey,
      surveyId: sessionId,
    });

    // Cleanup session after 5 minutes
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5 * 60 * 1000);

    return finalSurvey;
  }

  public static getSession(sessionId: string): PipelineSession | undefined {
    return this.sessions.get(sessionId);
  }
}
