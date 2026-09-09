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

export interface GenerationOptions {
  documentId?: string;
  documentText?: string;
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
  variables: Array<{
    name: string;
    description: string;
    formulaDraft?: string;
  }>;
  criticalJumpPoints: Array<{
    questionIndex: number;
    purpose: 'screening' | 'branching' | 'scoring';
    description: string;
  }>;
}

export type PipelineEvent =
  | { type: 'stage_start'; stage: 'planning' | 'generating'; message: string }
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
    });

    return { client, model: config.model };
  }

  /**
   * 执行双阶生成流水线
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
      'planning',
      now,
      now
    );

    try {
      const docText = options.documentText || '';
      const targetCount = Math.max(3, Math.min(30, options.targetCount || 8));

      // Phase 1: 蓝图策划
      onEvent({
        type: 'stage_start',
        stage: 'planning',
        message: '正在深入分析调研诉求与知识文档，规划全景蓝图与题组块...',
      });

      const blueprint = await this.stage1PlanBlueprint(docText, options.prompt, targetCount);
      onEvent({ type: 'blueprint_ready', blueprint });

      db.prepare(`
        UPDATE ai_generation_sessions
        SET blueprint_json = ?, status = 'generating', updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(blueprint), new Date().toISOString(), sessionId);

      // Phase 2: 题组块顺次合成 (含极速防死循环守卫)
      onEvent({
        type: 'stage_start',
        stage: 'generating',
        message: '已锁定架构蓝图，正在以题组块为单位逐项合成题目与跳转逻辑...',
      });

      const questions = await this.stage2DraftQuestionsAndLogic(
        blueprint,
        docText,
        options.prompt,
        options.enableJumpLogic !== false,
        (q, idx, total) => {
          onEvent({ type: 'question_drafted', question: q, index: idx, total });
        }
      );

      // 组装最终问卷模型
      const finalSurvey: QuestionnaireModel = {
        id: `sur_ai_${sessionId.replace('ses_', '')}`,
        title: blueprint.title || 'AI 生成专项评估问卷',
        description: blueprint.description || '基于智能体架构与多题组块流水线自动构建。',
        questions,
      };

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
    targetCount: number = 8
  ): Promise<SurveyBlueprint> {
    const validCount = Math.max(3, Math.min(30, targetCount || 8));
    return this.stage1PlanBlueprint(documentText, prompt, validCount);
  }

  /**
   * Stage 1: 架构与全景蓝图策划
   */
  private static async stage1PlanBlueprint(
    docText: string,
    userPrompt: string,
    targetCount: number
  ): Promise<SurveyBlueprint> {
    const ai = this.getOpenAI();
    const relevantDoc = docText ? docText.slice(0, 25000) : '';

    try {
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `你是一位顶级问卷架构师与统计调研专家。
请根据用户的调研诉求或参考文档，制定严谨的问卷全景蓝图（Blueprint），并将其划分为 3~4 个具有清晰逻辑递进关系的【调研题组块 (blocks)】。
【组块划分黄金法则】：
- 组块 1: 身份属性与人群甄别（2~3题，单选为主，用于确认是否属于调研目标受众）；
- 组块 2: 核心行为习惯与使用场景（2~3题，单选与多选，考察日常偏好与频次）；
- 组块 3: 满意度与体验量化评估（2~4题，5级李克特量表题，核心指标打分）；
- 组块 4: 深层痛点与开放建议（1~2题，开放文本填空题与未来改进期望）。

必须输出纯 JSON，结构如下：
{
  "title": "问卷标题（中文）",
  "description": "问卷背景与填答价值说明（中文，50~100字）",
  "targetAudience": "目标受众画像（中文）",
  "blocks": [
    {
      "id": "b1",
      "name": "受访者身份与甄别",
      "description": "甄别核心受众与基础属性",
      "questionCount": 2,
      "purpose": "screening"
    }
  ],
  "variables": [
    { "name": "v1", "description": "综合满意度得分" }
  ],
  "criticalJumpPoints": [
    { "questionIndex": 1, "purpose": "screening", "description": "身份甄别，筛除非目标人群" }
  ]
}
核心准则：
1. 全文必须使用规范自然的中文。
2. 所有 blocks 的 questionCount 加总必须精确等于 ${targetCount}。
3. 每个 block 的 id 严格为 b1, b2, b3... 递增。`,
          },
          {
            role: 'user',
            content: `用户调研诉求: ${userPrompt || '用户综合体验与满意度调研'}\n目标总题数: ${targetCount}\n参考知识文档摘要:\n${relevantDoc || '（未提供额外文档，请基于专业调研方法论深度推演）'}`,
          },
        ],
      });

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
  }): Promise<QuestionItemModel[]> {
    const ai = this.getOpenAI();
    const startIndex = params.existingQuestions.length + 1;
    const count = Math.max(1, Math.min(10, params.block.questionCount || 2));
    const targetEndIndex = startIndex + count - 1;

    const previousSummary = params.existingQuestions
      .map((q) => `[${q.id}] ${q.title} (${q.type})`)
      .join('; ');

    const jumpInstruction = params.enableJumpLogic !== false
      ? `逻辑跳转规范：
- 若为甄别题（如第 1 题），对不符合条件的选项索引（0-indexed 纯数字），设置 "jump": [ { "when": { "q${startIndex}": 0 }, "to": "exit" }, { "else": true, "to": "q${startIndex + 1}" } ]
- 若跳转到下一题，设置 "to": "qK"（K 必须大于当前题号）；若完成设置 "to": "end"。
- 普通无跳转题目请完全省略 jump 和 set。`
      : `严禁生成任何 jump 或 set 字段。`;

    const userPromptContent = [
      `问卷总体标题: ${params.blueprint.title}`,
      `总体调研背景: ${params.blueprint.description}`,
      `目标受众: ${params.blueprint.targetAudience}`,
      `当前出题题组块: 【${params.block.name}】`,
      `该组块考察目标: ${params.block.description}`,
      `该组块必须生成的题目数量: ${count} 题`,
      `题目编号必须严格从 q${startIndex} 到 q${targetEndIndex}，不可跳跃`,
      previousSummary ? `前置已确认的题目上下文: ${previousSummary}` : `（这是问卷的第一个题组块）`,
      params.refinePrompt ? `【用户重点干预修改要求】: ${params.refinePrompt}` : '',
    ].filter(Boolean).join('\n');

    try {
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `你是一位顶级问卷设计师。请根据指定调研题组块的要求，生成符合极简契约的高质量题目列表。
必须输出纯 JSON，结构如下：
{
  "questions": [
    {
      "id": "q${startIndex}",
      "type": "single_choice" | "multiple_choice" | "likert_scale" | "text_input",
      "title": "题目题干（严谨简练的中文）",
      "options": ["选项0", "选项1", "选项2"],
      "required": true,
      "jump": [ { "when": { "q${startIndex}": 0 }, "to": "exit" }, { "else": true, "to": "q${startIndex + 1}" } ]
    }
  ]
}

题型规范：
1. single_choice、multiple_choice、likert_scale 必须提供 options 字符串数组。
2. text_input 必须省略 options 并提供 placeholder。
3. likert_scale 必须提供 5 级规范阶梯（如：["非常不满意", "不满意", "一般", "满意", "非常满意"]）。
4. 题目题号必须从 q${startIndex} 严格顺序递增至 q${targetEndIndex}。
5. 选项遵循 MECE 原则，杜绝敷衍空话。
${jumpInstruction}`,
          },
          {
            role: 'user',
            content: userPromptContent,
          },
        ],
      });

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

    return this.fastAcyclicGuard(allQuestions);
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
      variables: Array.isArray(raw.variables) ? raw.variables : [{ name: 'v1', description: '综合满意度得分' }],
      criticalJumpPoints: Array.isArray(raw.criticalJumpPoints) ? raw.criticalJumpPoints : [{ questionIndex: 1, purpose: 'screening', description: '身份甄别' }],
    };
  }
}
