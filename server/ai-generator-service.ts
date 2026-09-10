/**
 * server/ai-generator-service.ts
 *
 * 轻量真实双阶 AI 问卷流式生成引擎 (Lean Agentic Survey Pipeline)
 *
 * 两大核心阶段：
 * Phase 1: 蓝图策划 (全景分面、受众画像、派生变量池与分流策略)
 * Phase 2: 题目与语义逻辑合成 (结合选项含义真实生成 jump 与 set，并经过毫秒级单遍防环守卫)
 *
 * 核心准则：
 * 1. 零离线假兜底：无模型或 API 错误立即显式中断报错；
 * 2. 零冗余假审查：单遍有向图环路阻断 (O(V+E))，绝无死循环；
 * 3. 极速响应：真语义、高透明度。
 */

import OpenAI from 'openai';
import type {
  QuestionnaireModel,
  QuestionItemModel,
} from '../src/schema/questionnaire-schema-types';
import { db } from './db';
import { generateSessionId } from './id-generator';
import { ConfigService } from './config-service';
import { TemplateService } from './template-service';
import { LlmLogger } from './llm-logger';

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

export class AiGeneratorService {
  /**
   * 获取并严格检验 OpenAI 客户端配置，缺失或无效则立即抛出异常
   */
  private static getOpenAI(): { client: OpenAI; model: string } {
    const config = ConfigService.getConfig();
    if (!config.apiKey || !config.model) {
      throw new Error('AI 模型未配置或 API 密钥缺失。请先在控制台右上角「设置」中配置有效的 API Key 与 Model 名称。');
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      timeout: 600000, // 10 分钟客户端超时，充分保障大题目量深思模型直出
      maxRetries: 2,
    });

    return { client, model: config.model };
  }

  /**
   * 极简高自由度单次直出生成 (Direct Lean Survey Generation)
   * 只定义标准数据契约规范，彻底消除死板说教与保姆式限制，赋予 AI 最大推演自由度。
   */
  public static async generateDirectSurvey(
    options: GenerationOptions,
    onThought?: (delta: string) => void
  ): Promise<QuestionnaireModel> {
    const ai = this.getOpenAI();
    const targetCount = Math.max(3, Math.min(80, options.targetCount || 8));
    const docText = options.documentText ? options.documentText.slice(0, 25000) : '';
    const prompt = (options.prompt || '').trim();
    const enableJump = options.enableJumpLogic !== false;

    const systemPrompt = `你是一位调研设计专家。请根据用户需求生成结构化问卷 JSON。
必须直接输出符合以下 TypeScript 契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

数据契约定义：
interface QuestionnaireOutput {
  title: string;
  description: string;
  questions: QuestionItem[];
}

type QuestionItem =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | LikertScaleQuestion
  | TextInputQuestion;

// 单选题
interface SingleChoiceQuestion {
  id: string;          // 题号 "q1", "q2"...
  type: "single_choice";
  title: string;
  options: string[];   // 选项文本
  jump?: JumpRule[];
}

// 多选题
interface MultipleChoiceQuestion {
  id: string;
  type: "multiple_choice";
  title: string;
  options: string[];   // 选项文本
  jump?: JumpRule[];
}

// 量表题（矩阵评分）
interface LikertScaleQuestion {
  id: string;
  type: "likert_scale";
  title: string;
  options: string[];   // 评分刻度（列）
  statements: string[];// 评价条目（行）
  jump?: JumpRule[];
}

// 填空题
interface TextInputQuestion {
  id: string;
  type: "text_input";
  title: string;
  placeholder?: string;
}

// 跳转规则（仅在关键节点使用）
interface JumpRule {
  when?: Record<string, number | { has: number } | { "<=": number } | { ">=": number }>;
  else?: boolean;
  to: string;          // 目标题号 "qK"、正常完成 "end" 或淘汰退出 "exit"
}

逻辑模板与拓扑规则：
- 拓扑骨架：模板定义关键节点的跳转分支与流转规则（如前置筛选、深度追问等）。
- 语义填充：遵循模板的流转网络，结合用户的具体调研需求生成对应的题干、选项及评价维度。
- 缺省行为：未选用模板时，默认采用线性自然推进，仅在有明确分流需要时自主配置关键节点（跳转必须单向向前）。`;

    const templateContext = TemplateService.formatTemplatesForPrompt(options.templateIds);

    const userPrompt = [
      `调研需求：${prompt || '用户综合体验与满意度调研'}`,
      `目标题量：约 ${targetCount} 题`,
      docText ? `参考资料：\n${docText}` : '',
      templateContext ? `参考逻辑模板：\n${templateContext}` : '',
      '请直接输出符合契约的纯 JSON 问卷数据：',
    ].filter(Boolean).join('\n\n');

    try {
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
        { targetCount, enableJumpLogic: options.enableJumpLogic },
        { onThought }
      );

      const raw = response.choices[0]?.message?.content;
      if (!raw) {
        throw new Error('模型未返回任何数据');
      }

      const parsed = this.extractAndParseJson<any>(raw, null);
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error('模型返回的数据无法解析为有效问卷 JSON');
      }

      // 规范化题目模型
      const sanitizedQuestions: QuestionItemModel[] = parsed.questions.map((q: any, i: number) => {
        const id = `q${i + 1}`;
        const type = ['single_choice', 'multiple_choice', 'likert_scale', 'text_input'].includes(q.type)
          ? q.type
          : 'single_choice';
        return {
          id,
          type,
          title: q.title || `题目 ${i + 1}`,
          options: Array.isArray(q.options) ? q.options : undefined,
          placeholder: q.placeholder,
          required: q.required !== false,
          set: q.set && typeof q.set === 'object' ? q.set : undefined,
          jump: q.jump,
        };
      });

      // 毫秒级单遍有向图防环守护与未引用变量自动清理
      const safeQuestions = this.cleanUnusedVariables(this.fastAcyclicGuard(sanitizedQuestions));

      return {
        id: `sur_ai_${generateSessionId().replace('ses_', '')}`,
        title: parsed.title || 'AI 生成专项问卷',
        description: parsed.description || '基于用户调研诉求智能推演构建。',
        questions: safeQuestions,
      };
    } catch (err: any) {
      console.error('[AiGeneratorService] generateDirectSurvey 异常:', err);
      throw new Error(`AI 生成问卷失败: ${err?.message || '模型接口异常'}`);
    }
  }

  /**
   * 执行极速直出生成流水线
   */
  public static async executePipeline(
    options: GenerationOptions,
    onEvent: (event: PipelineEvent) => void
  ): Promise<QuestionnaireModel> {
    const sessionId = generateSessionId();
    const now = new Date().toISOString();

    // 预检模型配置有效性
    this.getOpenAI();

    // 记录生成会话到数据库
    db.prepare(`
      INSERT INTO ai_generation_sessions (
        id, document_id, user_prompt, target_count, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      options.documentId || null,
      options.prompt,
      options.targetCount,
      'generating',
      now,
      now
    );

    try {
      onEvent({
        type: 'stage_start',
        stage: 'generating',
        message: '正在基于调研诉求自主推演问卷架构与题目流向...',
      });

      const finalSurvey = await this.generateDirectSurvey(options, (delta) => {
        onEvent({ type: 'thought_chunk', delta });
      });

      // 下发每道题目就绪事件供流式反馈
      finalSurvey.questions.forEach((q, idx) => {
        onEvent({
          type: 'question_drafted',
          question: q,
          index: idx + 1,
          total: finalSurvey.questions.length,
        });
      });

      db.prepare(`
        UPDATE ai_generation_sessions SET status = 'completed', updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), sessionId);

      onEvent({ type: 'completed', survey: finalSurvey, sessionId });
      return finalSurvey;
    } catch (err: any) {
      console.error('[AiGeneratorService] 生成流水线异常:', err);
      const errMsg = err?.message || 'AI 问卷生成中断';
      db.prepare(`
        UPDATE ai_generation_sessions SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?
      `).run(errMsg, new Date().toISOString(), sessionId);
      onEvent({ type: 'error', error: errMsg });
      throw err;
    }
  }

  /**
   * 健壮地从模型原始输出中提取并解析 JSON 对象
   * 兼容 Markdown 代码块、DeepSeek <think> 推理标签、首尾废话等
   */
  public static extractAndParseJson<T = any>(raw: string, fallback: T): T {
    if (!raw || typeof raw !== 'string') return fallback;

    // 1. 去除推理链标签 <think>...</think>
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // 2. 去除 Markdown 代码块标记 ```json 或 ```
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // 3. 尝试直接解析
    try {
      return JSON.parse(cleaned);
    } catch {
      // ignore
    }

    // 4. 正则寻找最外层的 { ... } 或 [ ... ]
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx > startIdx) {
      const candidate = cleaned.slice(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // 尝试去除末尾多余逗号后重试
        try {
          const sanitized = candidate.replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(sanitized);
        } catch {
          // ignore
        }
      }
    }

    return fallback;
  }

  /**
   * 独立规划全景蓝图与题组块 (Stage 1)
   */
  public static async planBlueprint(
    prompt: string,
    documentText: string = '',
    targetCount: number = 8,
    templateIds?: string[]
  ): Promise<SurveyBlueprint> {
    const validCount = Math.max(3, Math.min(80, targetCount || 8));
    return this.stage1PlanBlueprint(documentText, prompt, validCount, templateIds);
  }

  /**
   * Stage 1: 架构与全景蓝图策划
   */
  private static async stage1PlanBlueprint(
    docText: string,
    userPrompt: string,
    targetCount: number,
    templateIds?: string[]
  ): Promise<SurveyBlueprint> {
    const ai = this.getOpenAI();
    const relevantDoc = docText ? docText.slice(0, 25000) : '';
    const templateContext = TemplateService.formatTemplatesForPrompt(templateIds);

    try {
      const response = await LlmLogger.callAndLog(
        'Stage 1 蓝图策划 (stage1PlanBlueprint)',
        ai,
        {
          model: ai.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `你是一位专业调研设计专家。请根据用户的调研诉求生成全景问卷蓝图，并将其自然划分为 2~10 个递进的调研题组块（blocks）。
你可以根据实际调研场景（如产品体验、满意度、学术调研、考卷诊断、活动反馈等）自由决定各组块的名称、考察维度与题数分配。

必须直接输出纯 JSON，格式如下：
{
  "title": "问卷标题",
  "description": "问卷背景与说明（50~100字）",
  "targetAudience": "目标受众画像",
  "blocks": [
    {
      "id": "b1",
      "name": "组块名称",
      "description": "该组块调研目标",
      "questionCount": 2
    }
  ]
}

契约约束：
1. 所有 blocks 的 questionCount 之和必须精确等于 ${targetCount}。
2. 每个 block 的 id 严格为 b1, b2, b3... 顺序递增。
3. 题目作答结果即为变量，无需在蓝图中规划或预注册全局变量。`,
            },
            {
              role: 'user',
              content: [
                `调研诉求: ${userPrompt || '用户综合体验与满意度调研'}`,
                `目标题数: ${targetCount}`,
                templateContext ? `参考逻辑模板与拓扑范式:\n${templateContext}\n（请吸收参考上述模板中的结构与分流设计规划各组块）` : '',
                `参考资料:\n${relevantDoc || '（无额外参考文档，请基于专业调研方法论自主推演）'}`,
              ].filter(Boolean).join('\n'),
            },
          ],
        },
        { targetCount, templateIds }
      );

      const raw = response.choices[0]?.message?.content;
      if (!raw) {
        throw new Error('模型未返回有效蓝图数据');
      }
      const parsed = this.extractAndParseJson(raw, null);
      if (!parsed) {
        throw new Error('模型返回的蓝图数据无法解析为有效 JSON');
      }
      return this.sanitizeBlueprint(parsed, targetCount);
    } catch (err: any) {
      console.error('[AiGeneratorService] Stage 1 蓝图策划失败:', err);
      throw new Error(`蓝图策划阶段请求失败 (${err?.status || err?.name || 'Error'}): ${err?.message || 'API 调用无效'}`);
    }
  }

  /**
   * 单独生成单个题组块题目 (Stage 2 组块单元出题)
   */
  public static async generateBlockQuestions(params: {
    blueprint: SurveyBlueprint;
    block: SurveyBlockDefinition;
    existingQuestions: QuestionItemModel[];
    enableJumpLogic?: boolean;
    refinePrompt?: string;
    documentText?: string;
    templateIds?: string[];
  }): Promise<QuestionItemModel[]> {
    const ai = this.getOpenAI();
    const startIndex = params.existingQuestions.length + 1;
    const count = Math.max(1, Math.min(50, params.block.questionCount || 2));
    const targetEndIndex = startIndex + count - 1;
    const templateContext = TemplateService.formatTemplatesForPrompt(params.templateIds);

    const previousSummary = params.existingQuestions
      .map((q) => `[${q.id}] ${q.title} (${q.type})`)
      .join('; ');

    const jumpInstruction = params.enableJumpLogic !== false
      ? `流转规则：
- 默认自然顺延，常规题目无需声明 jump。
- 仅在关键分流/甄别节点声明 jump：
  - 单选匹配：{ "when": { "q${startIndex}": 0 }, "to": "q${startIndex + 2}" }
  - 多选包含：{ "when": { "q${startIndex}": { "has": 1 } }, "to": "q${startIndex + 2}" }
  - 评分比较：{ "when": { "q${startIndex}": { "<=": 1 } }, "to": "q${startIndex + 2}" }
  - 淘汰退出："to": "exit"
  - 提前完成："to": "end"
  - 仅允许单向向前跳转（目标题号必须更大）。`
      : `流转规则：严禁生成任何 jump 字段。`;

    const userPromptContent = [
      `问卷标题: ${params.blueprint.title}`,
      `总体背景: ${params.blueprint.description}`,
      `当前出题组块: 【${params.block.name}】（${params.block.description}）`,
      `必须生成题目数量: ${count} 题（题号必须从 q${startIndex} 到 q${targetEndIndex}）`,
      previousSummary ? `前序已生成题目: ${previousSummary}` : '',
      templateContext ? `参考逻辑模板:\n${templateContext}` : '',
      params.refinePrompt ? `用户补充要求: ${params.refinePrompt}` : '',
    ].filter(Boolean).join('\n');

    try {
      const response = await LlmLogger.callAndLog(
        `Stage 2 组块出题: 【${params.block.name}】`,
        ai,
        {
          model: ai.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `你是一位调研设计专家。请根据指定调研组块的要求生成题目列表。
必须直接输出符合以下 TypeScript 契约的纯 JSON 数据，严禁输出任何 Markdown 标记或多余文字。

契约定义：
{
  questions: QuestionItem[];
}

type QuestionItem =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | LikertScaleQuestion
  | TextInputQuestion;

// 单选题
interface SingleChoiceQuestion {
  id: string;          // 题号从 q${startIndex} 到 q${targetEndIndex}
  type: "single_choice";
  title: string;
  options: string[];   // 选项文本
  jump?: JumpRule[];
}

// 多选题
interface MultipleChoiceQuestion {
  id: string;
  type: "multiple_choice";
  title: string;
  options: string[];   // 选项文本
  jump?: JumpRule[];
}

// 量表题（矩阵评分）
interface LikertScaleQuestion {
  id: string;
  type: "likert_scale";
  title: string;
  options: string[];   // 评分刻度（列）
  statements: string[];// 评价条目（行）
  jump?: JumpRule[];
}

// 填空题
interface TextInputQuestion {
  id: string;
  type: "text_input";
  title: string;
  placeholder?: string;
}

// 跳转规则（仅在关键节点使用）
interface JumpRule {
  when?: Record<string, number | { has: number } | { "<=": number } | { ">=": number }>;
  else?: boolean;
  to: string;          // 目标题号 "qK"、正常完成 "end" 或淘汰退出 "exit"
}

规范：
- 题号必须严格从 q${startIndex} 到 q${targetEndIndex} 顺序递增。
${jumpInstruction}`,
            },
            {
              role: 'user',
              content: userPromptContent,
            },
          ],
        },
        { blockId: params.block.id, blockName: params.block.name, count }
      );

      const raw = response.choices[0]?.message?.content;
      if (!raw) {
        throw new Error('模型未返回有效题目数据');
      }

      const parsed = this.extractAndParseJson(raw, null);
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error('模型返回的题目列表为空或格式无法解析');
      }

      const questions: QuestionItemModel[] = parsed.questions.map((q: any, i: number) => ({
        id: `q${startIndex + i}`,
        type: q.type || 'single_choice',
        title: q.title || `${params.block.name} 题 ${i + 1}`,
        options: Array.isArray(q.options) ? q.options : undefined,
        placeholder: q.placeholder,
        required: q.required !== false,
        set: q.set && typeof q.set === 'object' ? q.set : undefined,
        jump: q.jump,
      }));

      return questions;
    } catch (err: any) {
      console.error('[AiGeneratorService] generateBlockQuestions 异常:', err);
      throw new Error(`组块生成失败: ${err?.message || 'API 调用异常'}`);
    }
  }

  /**
   * Stage 2: 题目与语义逻辑流转全量生成 (按组块顺次生成并下发流式事件)
   */
  private static async stage2DraftQuestionsAndLogic(
    blueprint: SurveyBlueprint,
    docText: string,
    userPrompt: string,
    enableJumpLogic: boolean,
    onProgress: (q: QuestionItemModel, index: number, total: number) => void
  ): Promise<QuestionItemModel[]> {
    const allQuestions: QuestionItemModel[] = [];
    const blocks = blueprint.blocks || blueprint.dimensions || [];
    const totalTarget = blocks.reduce((acc, b) => acc + b.questionCount, 0);

    for (const block of blocks) {
      const chunkQuestions = await this.generateBlockQuestions({
        blueprint,
        block,
        existingQuestions: allQuestions,
        enableJumpLogic,
        documentText: docText,
      });

      allQuestions.push(...chunkQuestions);
      chunkQuestions.forEach((q) => {
        onProgress(q, allQuestions.length, totalTarget);
      });
    }

    const safeQuestions = this.fastAcyclicGuard(allQuestions);
    return this.cleanUnusedVariables(safeQuestions);
  }

  /**
   * 极速单遍有向图防死循环守卫 (Fast Acyclic Guard - O(V+E) 耗时 < 0.1ms)
   */
  public static fastAcyclicGuard(questions: QuestionItemModel[]): QuestionItemModel[] {
    const existingIds = new Set(questions.map((q) => q.id));

    // 1. 过滤悬空目标与自环 (u -> u)
    for (const q of questions) {
      if (!q.jump) continue;

      if (typeof q.jump === 'string') {
        const target = q.jump.trim();
        if (target === q.id || (target !== 'exit' && target !== 'end' && !existingIds.has(target))) {
          delete q.jump;
        }
      } else if (Array.isArray(q.jump)) {
        const filteredRules = q.jump.filter((rule) => {
          const target = rule.to?.trim();
          if (!target || target === q.id) return false;
          return target === 'exit' || target === 'end' || existingIds.has(target);
        });
        if (filteredRules.length > 0) {
          q.jump = filteredRules;
        } else {
          delete q.jump;
        }
      }
    }

    // 2. 有向图环路检测 (DFS 染色法)
    const adj = new Map<string, string[]>();
    for (const q of questions) {
      const targets: string[] = [];
      if (typeof q.jump === 'string') {
        targets.push(q.jump.trim());
      } else if (Array.isArray(q.jump)) {
        for (const rule of q.jump) {
          if (rule.to) targets.push(rule.to.trim());
        }
      }
      adj.set(q.id, targets);
    }

    const state = new Map<string, number>();
    const safeQuestions = questions.map((q) => ({ ...q }));

    const detectAndBreak = (u: string) => {
      state.set(u, 1);
      const targets = adj.get(u) || [];
      const validTargets: string[] = [];

      for (const v of targets) {
        if (v === 'exit' || v === 'end') {
          validTargets.push(v);
          continue;
        }

        const vState = state.get(v) || 0;
        if (vState === 1) {
          console.warn(`[FastAcyclicGuard] 检测到回跳环路: ${u} -> ${v}，已自动切断。`);
          continue;
        }

        if (vState === 0) {
          detectAndBreak(v);
        }
        validTargets.push(v);
      }

      const targetSet = new Set(validTargets);
      const currQ = safeQuestions.find((q) => q.id === u);
      if (currQ && currQ.jump) {
        if (typeof currQ.jump === 'string') {
          if (!targetSet.has(currQ.jump.trim())) {
            delete currQ.jump;
          }
        } else if (Array.isArray(currQ.jump)) {
          currQ.jump = currQ.jump.filter((r) => r.to && targetSet.has(r.to.trim()));
          if (currQ.jump.length === 0) {
            delete currQ.jump;
          }
        }
      }

      state.set(u, 2);
    };

    for (const q of questions) {
      if ((state.get(q.id) || 0) === 0) {
        detectAndBreak(q.id);
      }
    }

    return safeQuestions;
  }

  /**
   * 自动取消未使用的变量注册 (Clean Unused Variables)
   * 准则：每道题目的答题结果自身就是变量（直接使用题号 q1, q2... 引用，无需提前注册）。
   * 若题目中定义了 set 衍生变量，但该变量在所有跳转条件、计算公式、文本插值中均未被引用，则自动剔除注册。
   */
  public static cleanUnusedVariables(questions: QuestionItemModel[]): QuestionItemModel[] {
    const usedIdentifiers = new Set<string>();

    // 1. 扫描所有 jump 条件中引用的变量名 (when 字典的 keys)
    for (const q of questions) {
      if (Array.isArray(q.jump)) {
        for (const rule of q.jump) {
          if (rule.when && typeof rule.when === 'object') {
            for (const key of Object.keys(rule.when)) {
              usedIdentifiers.add(key.trim());
            }
          }
        }
      }
    }

    // 2. 扫描所有 set 算式中引用的操作数标识符 (如 "v1 + q2 * 3" 中的 v1, q2)
    for (const q of questions) {
      if (q.set && typeof q.set === 'object') {
        for (const formula of Object.values(q.set)) {
          if (typeof formula === 'string') {
            const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
            if (matches) {
              matches.forEach((id) => usedIdentifiers.add(id));
            }
          }
        }
      }
    }

    // 3. 扫描所有题干、描述与占位符中的插值变量 (如 {{v1}}, ${v1}, {{q1}})
    const interpolationRegex = /(?:\{\{|\$\{)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\}\}|\})/g;
    for (const q of questions) {
      const texts = [q.title, q.description, q.placeholder].filter(Boolean) as string[];
      for (const text of texts) {
        let match: RegExpExecArray | null;
        while ((match = interpolationRegex.exec(text)) !== null) {
          if (match[1]) {
            usedIdentifiers.add(match[1].trim());
          }
        }
      }
    }

    // 4. 清理每道题目的 set 中未被引用的冗余注册
    return questions.map((q) => {
      if (!q.set || typeof q.set !== 'object') {
        return q;
      }

      const activeSet: Record<string, string | number> = {};
      for (const [varName, expr] of Object.entries(q.set)) {
        // 如果题目企图把自己的题号 set 进变量（如 q1: 0），或者该衍生变量从未被引用，则自动剔除
        if (usedIdentifiers.has(varName) && varName !== q.id) {
          activeSet[varName] = expr;
        }
      }

      const newQ = { ...q };
      if (Object.keys(activeSet).length > 0) {
        newQ.set = activeSet;
      } else {
        delete newQ.set;
      }

      return newQ;
    });
  }

  private static sanitizeBlueprint(raw: any, targetCount: number): SurveyBlueprint {
    const rawList = Array.isArray(raw.blocks) && raw.blocks.length > 0
      ? raw.blocks
      : Array.isArray(raw.dimensions) && raw.dimensions.length > 0
      ? raw.dimensions
      : null;

    let blocks: SurveyBlockDefinition[];
    if (rawList) {
      blocks = rawList.map((b: any, idx: number) => ({
        id: b.id || `b${idx + 1}`,
        name: b.name || `调研评估组块 ${idx + 1}`,
        description: b.description || '',
        questionCount: Math.max(1, Number(b.questionCount) || 2),
        purpose: b.purpose || (idx === 0 ? 'screening' : 'general'),
      }));
    } else {
      blocks = [
        { id: 'b1', name: '受访者背景与甄别', description: '甄别核心受众与基础属性', questionCount: 2, purpose: 'screening' },
        { id: 'b2', name: '核心行为与场景体验', description: '深入考察日常行为与使用偏好', questionCount: Math.max(2, targetCount - 4), purpose: 'general' },
        { id: 'b3', name: '满意度量化评价与建议', description: '李克特量表打分与改进期望', questionCount: 2, purpose: 'scoring' },
      ];
    }

    return {
      title: raw.title || 'AI 智能评估专项调研',
      description: raw.description || '基于智能体架构深度提炼与多维拆解。',
      targetAudience: raw.targetAudience || '相关从业人员与目标用户',
      dimensions: blocks,
      blocks,
      variables: Array.isArray(raw.variables) ? raw.variables : undefined,
      criticalJumpPoints: Array.isArray(raw.criticalJumpPoints) ? raw.criticalJumpPoints : undefined,
    };
  }
}
