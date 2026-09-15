/**
 * server/ai/generator/generator-service.ts
 *
 * Facade service for questionnaire generation subsystem.
 * Exposes direct lean survey generation and concurrent agentic pipelines.
 */

import {
  type QuestionnaireModel,
  type QuestionItemModel,
  normalizeQuestionnaire,
} from '../../../src/schema/questionnaire-schema-types';
import { LlmClientFactory } from '../shared/llm-client';
import { StructuredOutputParser } from '../shared/structured-output';
import { LlmLogger } from '../../llm-logger';
import { GeneratorPromptBuilder } from './prompt-builder';
import { GeneratorContextBuilder } from './context-builder';
import { GeneratorResultParser, SurveyTaskItem } from './result-parser';
import { SurveyGraphValidator } from './validator';
import {
  ConcurrentPipelineEngine,
  ConcurrentPipelineEvent,
  SurveyTaskPlan,
} from './pipeline';

export interface GenerationOptions {
  documentId?: string;
  documentText?: string;
  templateIds?: string[];
  prompt: string;
  targetCount: number;
  enableJumpLogic?: boolean;
}

export interface SurveyBlockDefinition {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  purpose?: 'screening' | 'branching' | 'scoring' | 'feedback' | 'general';
}

export interface SurveyBlueprint {
  title: string;
  description: string;
  targetAudience: string;
  dimensions: SurveyBlockDefinition[];
  blocks: SurveyBlockDefinition[];
  variables?: Array<{
    name: string;
    description: string;
    formulaDraft?: string;
  }>;
  criticalJumpPoints?: Array<{
    questionIndex: number;
    purpose: 'screening' | 'branching' | 'scoring';
    description: string;
  }>;
}

export type PipelineEvent =
  | { type: 'stage_start'; stage: 'planning' | 'generating'; message: string }
  | { type: 'thought_chunk'; delta: string }
  | { type: 'blueprint_ready'; blueprint: SurveyBlueprint }
  | { type: 'question_drafted'; question: QuestionItemModel; index: number; total: number }
  | { type: 'completed'; survey: QuestionnaireModel; sessionId: string }
  | { type: 'error'; error: string };

export class SurveyGeneratorService {
  /**
   * Direct lean survey generation (Single-shot)
   */
  public static async generateDirectSurvey(
    options: GenerationOptions,
    onThought?: (delta: string) => void
  ): Promise<QuestionnaireModel> {
    const ai = LlmClientFactory.getClient(600000);
    const targetCount = Math.max(3, Math.min(80, options.targetCount || 8));
    const docText = GeneratorContextBuilder.truncateDocumentText(options.documentText);
    const prompt = (options.prompt || '').trim();
    const enableJump = options.enableJumpLogic !== false;

    const systemPrompt = GeneratorPromptBuilder.buildDirectSurveySystemPrompt(
      targetCount,
      docText,
      enableJump
    );

    const templateContext = GeneratorContextBuilder.buildTemplateContext(options.templateIds);
    const userPrompt = GeneratorPromptBuilder.buildDirectSurveyUserPrompt(
      prompt,
      targetCount,
      docText,
      templateContext
    );

    const response = await LlmLogger.callAndLog(
      '极速直出全卷 (generateDirectSurvey)',
      ai,
      {
        model: ai.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { targetCount, enableJumpLogic: enableJump },
      { onThought }
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('模型未返回任何数据');
    }

    const parsed = StructuredOutputParser.extractAndParseJson<any>(raw, null);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('模型返回的数据无法解析为有效问卷 JSON');
    }

    const sanitizedQuestions = GeneratorResultParser.sanitizeDirectQuestions(parsed.questions);
    const safeQuestions = GeneratorResultParser.cleanUnusedVariables(
      SurveyGraphValidator.fastAcyclicGuard(sanitizedQuestions)
    );

    return normalizeQuestionnaire({
      id: '',
      title: String(parsed.title || prompt || '调研问卷').trim(),
      description: String(parsed.description || '基于 AI 极速直出全卷生成。').trim(),
      questions: safeQuestions,
    });
  }

  /**
   * Plan survey blueprint and tasks (Dispatcher Agent)
   */
  public static async planTasks(params: {
    prompt: string;
    targetCount?: number;
    documentText?: string;
    templateIds?: string[];
  }): Promise<SurveyTaskPlan> {
    return ConcurrentPipelineEngine.planTasks(params);
  }

  /**
   * Generate questions for a single chunk (Worker Agent)
   */
  public static async generateWorkerChunk(params: {
    blockId: `b${number}`;
    count: number;
    prompt: string;
  }): Promise<QuestionItemModel[]> {
    return ConcurrentPipelineEngine.generateWorkerChunk(params);
  }

  /**
   * Execute concurrent multi-agent pipeline
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
    return ConcurrentPipelineEngine.executeConcurrentPipeline(params, onEvent);
  }

  /**
   * Expose graph cycle guard
   */
  public static fastAcyclicGuard(questions: QuestionItemModel[]): QuestionItemModel[] {
    return SurveyGraphValidator.fastAcyclicGuard(questions);
  }

  /**
   * Expose unused variables cleaner
   */
  public static cleanUnusedVariables(questions: QuestionItemModel[]): QuestionItemModel[] {
    return GeneratorResultParser.cleanUnusedVariables(questions);
  }

  /**
   * Expose deterministic question assembler
   */
  public static assembleQuestions(
    tasks: SurveyTaskItem[],
    blockResults: Map<string, QuestionItemModel[]>
  ): QuestionItemModel[] {
    return GeneratorResultParser.assembleQuestions(tasks, blockResults);
  }

  /**
   * Robust JSON extraction utility
   */
  public static extractAndParseJson<T = any>(raw: string, fallback: T): T {
    return StructuredOutputParser.extractAndParseJson(raw, fallback);
  }
}
