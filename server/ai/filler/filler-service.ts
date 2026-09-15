/**
 * server/ai/filler/filler-service.ts
 *
 * Facade service for AI conversational questionnaire auto-filler.
 */

import OpenAI from 'openai';
import {
  type QuestionnaireModel,
  type QuestionAnswerMap,
} from '../../../src/schema/questionnaire-schema-types';
import { LlmClientFactory } from '../shared/llm-client';
import { LlmLogger } from '../../llm-logger';
import { FillerPromptBuilder } from './prompt-builder';
import {
  FillerDecisionEngine,
  ExtractedAnswerUpdate,
} from './decision-engine';

export interface ChatFillerRequest {
  survey: QuestionnaireModel;
  currentAnswers: QuestionAnswerMap;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatFillerResponse {
  success: boolean;
  reply: string;
  updates: ExtractedAnswerUpdate[];
  should_continue?: boolean;
}

export class SurveyFillerService {
  /**
   * Main entrypoint: Chat and extract answers
   */
  public static async chatAndExtract(req: ChatFillerRequest): Promise<ChatFillerResponse> {
    const { survey, currentAnswers = {}, messages = [] } = req;
    const ai = LlmClientFactory.getClient(120000);

    // 1. Cold start opening prompt (when conversation has not started yet)
    if (messages.length === 0) {
      return this.generateOpeningPrompt(ai, survey);
    }

    // 2. Build question schema summary for LLM context
    const questionsContext = FillerPromptBuilder.buildCompactQuestionsContext(
      survey.questions,
      currentAnswers
    );
    const systemPrompt = FillerPromptBuilder.buildSystemPrompt(questionsContext);

    // 3. Format message history (limit to last 10 messages for token economy)
    const recentMessages = messages.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 4. Two-stage decision and reply generation
    const result = await FillerDecisionEngine.executeTwoStageChat({
      ai,
      surveyId: survey.id,
      questions: survey.questions,
      systemPrompt,
      recentMessages,
    });

    return {
      success: true,
      reply: result.reply,
      updates: result.updates,
      should_continue: result.shouldContinue,
    };
  }

  /**
   * Cold start opening generator
   */
  public static async generateOpeningPrompt(
    ai: { client: OpenAI; model: string },
    survey: QuestionnaireModel
  ): Promise<ChatFillerResponse> {
    const previewQuestions = (survey.questions || [])
      .slice(0, 4)
      .map((q) => q.title)
      .join('、');

    const prompt = FillerPromptBuilder.buildOpeningPrompt(
      survey.title,
      survey.description || '',
      previewQuestions
    );

    const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: ai.model,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.5,
      max_tokens: 200,
    };

    const completion = await LlmLogger.callAndLog(
      'ai-chat-filler-opening',
      ai,
      createParams,
      { surveyId: survey.id }
    );

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      `你好！这份问卷主要了解关于「${survey.title}」的情况。你可以先简单说说你的主要情况，我会帮你把涉及的内容先记录好，剩余题目也可以稍后在问卷中查看~`;

    return {
      success: true,
      reply,
      updates: [],
      should_continue: true,
    };
  }
}
