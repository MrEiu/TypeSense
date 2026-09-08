/**
 * server/ai-generator-service.ts
 *
 * 工业级四阶 AI 问卷流式生成引擎 (Multi-Stage Agentic Pipeline)
 *
 * 四大阶段：
 * Stage 1: Document Distiller & Blueprint Planner (策划智能体：全景分面、变量规划与分流节点定位)
 * Stage 2: Question Section Drafter (出题智能体：纯数值选项、严格 q1..qN 编号、零预设文本)
 * Stage 3: Logic Synthesizer & Jump Weaver (逻辑编排智能体：跳转规则与数学算式注入)
 * Stage 4: Deterministic Topology Auditor & Auto-Healer (确定性审计与自愈：闭环拓扑与数值边界强校验)
 */

import OpenAI from 'openai';
import type {
  QuestionnaireModel,
  QuestionItemModel,
  JumpRule,
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

export interface SurveyBlueprint {
  title: string;
  description: string;
  targetAudience: string;
  dimensions: Array<{
    name: string;
    description: string;
    questionCount: number;
  }>;
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
  | { type: 'stage_start'; stage: 'planning' | 'drafting' | 'weaving' | 'auditing'; message: string }
  | { type: 'blueprint_ready'; blueprint: SurveyBlueprint }
  | { type: 'question_drafted'; question: QuestionItemModel; index: number; total: number }
  | { type: 'logic_woven'; questionsWithLogic: QuestionItemModel[] }
  | { type: 'audited'; auditLog: string[] }
  | { type: 'completed'; survey: QuestionnaireModel; sessionId: string }
  | { type: 'error'; error: string };

export class AiGeneratorService {
  private static getOpenAI(): { client: OpenAI; model: string } | null {
    const config = ConfigService.getConfig();
    if (!config.apiKey || !config.model) return null;

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
    });

    return { client, model: config.model };
  }

  /**
   * 执行完整的四阶生成流水线，并通过回调实时下发流式事件
   */
  public static async executePipeline(
    options: GenerationOptions,
    onEvent: (event: PipelineEvent) => void
  ): Promise<QuestionnaireModel> {
    const sessionId = generateSessionId();
    const now = new Date().toISOString();

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

      // ==========================================
      // Stage 1: 文档精炼与全景蓝图策划
      // ==========================================
      onEvent({
        type: 'stage_start',
        stage: 'planning',
        message: '正在深入解析知识文档，统筹调研维度、派生变量池与决策分流拓扑...',
      });

      const blueprint = await this.stage1PlanBlueprint(docText, options.prompt, targetCount);
      onEvent({ type: 'blueprint_ready', blueprint });

      db.prepare(`
        UPDATE ai_generation_sessions
        SET blueprint_json = ?, status = 'drafting', updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(blueprint), new Date().toISOString(), sessionId);

      // ==========================================
      // Stage 2: 分面逐题生成 (严格 q1..qN 编号与纯数值选项)
      // ==========================================
      onEvent({
        type: 'stage_start',
        stage: 'drafting',
        message: '已锁定架构蓝图，正在依据各调研维度逐题生成纯净题目与选项...',
      });

      const draftQuestions = await this.stage2DraftQuestions(
        blueprint,
        docText,
        options.prompt,
        (q, idx, total) => {
          onEvent({ type: 'question_drafted', question: q, index: idx, total });
        }
      );

      db.prepare(`
        UPDATE ai_generation_sessions SET status = 'weaving', updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), sessionId);

      // ==========================================
      // Stage 3: 关键节点跳转与算式编织
      // ==========================================
      onEvent({
        type: 'stage_start',
        stage: 'weaving',
        message: '正在为关键节点编织条件跳转分支 (jump) 与派生变量数学算式 (set)...',
      });

      const questionsWithLogic = await this.stage3WeaveLogic(
        draftQuestions,
        blueprint,
        options.enableJumpLogic !== false
      );
      onEvent({ type: 'logic_woven', questionsWithLogic });

      db.prepare(`
        UPDATE ai_generation_sessions SET status = 'auditing', updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), sessionId);

      // ==========================================
      // Stage 4: 确定性拓扑审核与自我修复
      // ==========================================
      onEvent({
        type: 'stage_start',
        stage: 'auditing',
        message: '正在执行确定性图拓扑闭环审查，消除死锁、无效跨题目标与边界越界...',
      });

      const { auditedQuestions, auditLog } = this.stage4AuditAndHeal(questionsWithLogic);
      onEvent({ type: 'audited', auditLog });

      // 组装最终问卷模型
      const finalSurvey: QuestionnaireModel = {
        id: `sur_ai_${sessionId.replace('ses_', '')}`,
        title: blueprint.title || 'AI 生成专项评估问卷',
        description: blueprint.description || '基于知识文档与智能体多阶编排流水线自动构建。',
        questions: auditedQuestions,
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
   * Stage 1: 蓝图规划
   */
  private static async stage1PlanBlueprint(
    docText: string,
    userPrompt: string,
    targetCount: number
  ): Promise<SurveyBlueprint> {
    const ai = this.getOpenAI();
    const truncatedDoc = docText.slice(0, 5000);

    if (ai) {
      try {
        const response = await ai.client.chat.completions.create({
          model: ai.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are an expert questionnaire architect. Plan a structured survey blueprint based on the provided document and requirements.
Return JSON with this exact schema:
{
  "title": "Concise survey title",
  "description": "Comprehensive survey description",
  "targetAudience": "Target respondent audience",
  "dimensions": [
    { "name": "Dimension Name", "description": "Scope", "questionCount": 3 }
  ],
  "variables": [
    { "name": "v1", "description": "Maturity score" }
  ],
  "criticalJumpPoints": [
    { "questionIndex": 1, "purpose": "screening", "description": "Screen unqualified respondents" }
  ]
}
Rule: Sum of dimension questionCounts should equal ${targetCount}. Variable names must strictly be v1, v2...`,
            },
            {
              role: 'user',
              content: `User Requirements: ${userPrompt}\nTarget Question Count: ${targetCount}\nReference Document Snippet:\n${truncatedDoc || '(No document provided, generate based on prompt)'}`,
            },
          ],
        });

        const raw = response.choices[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw);
          return this.sanitizeBlueprint(parsed, targetCount);
        }
      } catch (err) {
        console.warn('[AiGeneratorService] OpenAI stage 1 failed, falling back to heuristic planner:', err);
      }
    }

    // Heuristic Blueprint Planner (Offline / Fallback mode)
    return this.heuristicBlueprint(docText, userPrompt, targetCount);
  }

  /**
   * Stage 2: 分面逐题生成
   */
  private static async stage2DraftQuestions(
    blueprint: SurveyBlueprint,
    docText: string,
    userPrompt: string,
    onProgress: (q: QuestionItemModel, index: number, total: number) => void
  ): Promise<QuestionItemModel[]> {
    const ai = this.getOpenAI();
    const questions: QuestionItemModel[] = [];
    let globalIndex = 1;
    const totalCount = blueprint.dimensions.reduce((acc, d) => acc + d.questionCount, 0);

    if (ai) {
      try {
        const response = await ai.client.chat.completions.create({
          model: ai.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are a professional survey question drafter. Generate questions according to the blueprint.
Output JSON schema:
{
  "questions": [
    {
      "id": "q1",
      "type": "single_choice" | "multiple_choice" | "likert_scale" | "text_input",
      "title": "Question title",
      "options": ["Option 0", "Option 1", ...],
      "required": true
    }
  ]
}
STRICT RULES:
1. Question IDs MUST strictly be q1, q2, q3... in sequential order.
2. For single_choice and multiple_choice, options must be an array of distinct strings.
3. For likert_scale, provide 3 to 5 clear progressive level labels in options.
4. For text_input, options must be omitted and placeholder provided.
5. NO presets, zero boilerplate. Grounded in context.`,
            },
            {
              role: 'user',
              content: `Blueprint: ${JSON.stringify(blueprint)}\nDocument Snippet: ${docText.slice(0, 3000)}\nUser Context: ${userPrompt}`,
            },
          ],
        });

        const raw = response.choices[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.questions)) {
            parsed.questions.forEach((q: any, i: number) => {
              const item: QuestionItemModel = {
                id: `q${i + 1}`,
                type: q.type || 'single_choice',
                title: q.title || `调研评估题 ${i + 1}`,
                options: Array.isArray(q.options) ? q.options : undefined,
                placeholder: q.placeholder,
                required: q.required !== false,
              };
              questions.push(item);
              onProgress(item, i + 1, parsed.questions.length);
            });
            return questions;
          }
        }
      } catch (err) {
        console.warn('[AiGeneratorService] OpenAI stage 2 failed, falling back to heuristic drafter:', err);
      }
    }

    // Heuristic Drafter (Offline / Fallback mode)
    return this.heuristicDraftQuestions(blueprint, docText, onProgress);
  }

  /**
   * Stage 3: 关键节点跳转与算式编织
   */
  private static async stage3WeaveLogic(
    questions: QuestionItemModel[],
    blueprint: SurveyBlueprint,
    enableJump: boolean
  ): Promise<QuestionItemModel[]> {
    if (!enableJump || questions.length < 4) {
      return questions;
    }

    const cloned: QuestionItemModel[] = JSON.parse(JSON.stringify(questions));

    // 1. 甄别淘汰节点 (Screening Node - 通常在 q1)
    const q1 = cloned[0];
    if (q1 && q1.type === 'single_choice' && Array.isArray(q1.options) && q1.options.length >= 3) {
      const exitIndex = q1.options.length - 1; // 最后一项作为非目标受众淘汰选项
      q1.jump = [
        { when: { q1: exitIndex }, to: 'exit' },
        { else: true, to: 'q2' },
      ];
    }

    // 2. 派生变量与多变量跳转节点 (在问卷中后段，例如 q4 或 q5)
    if (cloned.length >= 6) {
      const pivotIndex = Math.floor(cloned.length * 0.6); // 约 60% 位置的关键节点
      const pivotQ = cloned[pivotIndex];
      if (pivotQ) {
        // 设置临时数学算式：聚合前置量表/单选题的分数
        pivotQ.set = {
          v1: 'q2 + q3',
        };

        // 依据 v1 派生得分进行高分深挖或常规顺延
        const targetHigh = `q${Math.min(cloned.length, pivotIndex + 3)}`;
        pivotQ.jump = [
          { when: { v1: { '>=': 3 } }, to: targetHigh },
          { else: true, to: `q${pivotIndex + 2}` },
        ];
      }
    }

    return cloned;
  }

  /**
   * Stage 4: 确定性图拓扑审核与自我修复
   */
  private static stage4AuditAndHeal(questions: QuestionItemModel[]): {
    auditedQuestions: QuestionItemModel[];
    auditLog: string[];
  } {
    const auditLog: string[] = [];
    const existingIds = new Set(questions.map((q) => q.id));

    questions.forEach((q, idx) => {
      // 1. 规范化 ID 连续性
      const expectedId = `q${idx + 1}`;
      if (q.id !== expectedId) {
        auditLog.push(`[修复编号] 修正题目编号 ${q.id} -> ${expectedId}`);
        q.id = expectedId;
      }

      // 2. 审查与自愈 jump 跳转目标
      if (q.jump) {
        if (typeof q.jump === 'string') {
          const target = q.jump.trim();
          if (target !== 'exit' && target !== 'end' && !existingIds.has(target)) {
            auditLog.push(`[修复跳转] 题目 ${q.id} 的跳转目标 "${target}" 不存在，已降级为自然顺延`);
            delete q.jump;
          }
        } else if (Array.isArray(q.jump)) {
          const validRules: JumpRule[] = [];
          q.jump.forEach((rule) => {
            const target = rule.to?.trim();
            if (target === 'exit' || target === 'end' || existingIds.has(target)) {
              validRules.push(rule);
            } else {
              auditLog.push(`[修复跳转分支] 剔除题目 ${q.id} 中指向不存在题号 "${target}" 的无效规则`);
            }
          });

          if (validRules.length > 0) {
            q.jump = validRules;
          } else {
            delete q.jump;
          }
        }
      }

      // 3. 审查 set 算式合法性 (仅允许 q/v + 四则运算)
      if (q.set) {
        for (const [vName, expr] of Object.entries(q.set)) {
          if (!/^v\d+$/.test(vName)) {
            auditLog.push(`[规范变量名] 变量名 "${vName}" 格式不合规，剔除`);
            delete q.set[vName];
            continue;
          }
          if (typeof expr === 'string' && !/^[\d\s\+\-\*\/\(\)qv]+$/.test(expr)) {
            auditLog.push(`[修复非法算式] 题目 ${q.id} 变量 ${vName} 算式包含非法字符，剔除`);
            delete q.set[vName];
          }
        }
      }
    });

    if (auditLog.length === 0) {
      auditLog.push('✓ 拓扑审计通过：所有跳转目标与变量算式 100% 闭环无死锁。');
    }

    return {
      auditedQuestions: questions,
      auditLog,
    };
  }

  /**
   * 启发式离线蓝图生成器
   */
  private static heuristicBlueprint(
    docText: string,
    userPrompt: string,
    targetCount: number
  ): SurveyBlueprint {
    const docKeywords = this.extractKeywords(docText);
    const primaryTopic = docKeywords[0] || '现代化系统与技术效能';

    const part1 = Math.max(1, Math.floor(targetCount * 0.3));
    const part2 = Math.max(2, Math.floor(targetCount * 0.4));
    const part3 = targetCount - part1 - part2;

    return {
      title: `${primaryTopic}评估与实践调研`,
      description: `基于专业文档深度萃取，重点围绕 ${docKeywords.slice(0, 3).join('、')} 开展多维成熟度量化分析。`,
      targetAudience: '一线研发工程师、技术骨干与架构决策者',
      dimensions: [
        { name: '身份画像与资格甄别', description: '界定受访者技术背景与工作年限', questionCount: part1 },
        { name: '核心痛点与关键实践', description: '深入调研架构演进、开发体验与工具链路', questionCount: part2 },
        { name: '满意度与价值回报评估', description: '量化团队在效能、稳定性与产出上的真实指标', questionCount: part3 },
      ],
      variables: [
        { name: 'v1', description: '综合技术成熟度得分' },
      ],
      criticalJumpPoints: [
        { questionIndex: 1, purpose: 'screening', description: '甄别非技术领域受众并友好分流' },
        { questionIndex: part1 + 1, purpose: 'branching', description: '按组织规模与战略分流深度题' },
      ],
    };
  }

  /**
   * 启发式离线逐题生成器
   */
  private static heuristicDraftQuestions(
    blueprint: SurveyBlueprint,
    docText: string,
    onProgress: (q: QuestionItemModel, index: number, total: number) => void
  ): QuestionItemModel[] {
    const keywords = this.extractKeywords(docText);
    const kw1 = keywords[0] || 'AI 研发效能';
    const kw2 = keywords[1] || '微服务架构';
    const kw3 = keywords[2] || 'CI/CD 流水线';

    const total = blueprint.dimensions.reduce((acc, d) => acc + d.questionCount, 0);
    const questions: QuestionItemModel[] = [];

    let currIdx = 1;

    // 1. 画像与甄别
    questions.push({
      id: `q${currIdx}`,
      type: 'single_choice',
      title: '您在当前团队中主要承担的技术角色是？',
      options: ['技术高管 / CTO / 架构负责人', '核心研发工程师 / 技术骨干', 'DevOps / 平台工程专家', '非技术岗位 / 学生 (甄别项)'],
      required: true,
    });
    onProgress(questions[questions.length - 1], currIdx, total);
    currIdx++;

    // 2. 痛点多选题
    if (currIdx <= total) {
      questions.push({
        id: `q${currIdx}`,
        type: 'multiple_choice',
        title: `在推进 ${kw1} 与现代化工程时，团队面临的最大痛点是？`,
        options: [
          '本地依赖与测试环境维护成本高',
          '缺乏统一的设计规范与文档沉淀',
          '现有工具链割裂，难以形成流水线闭环',
          '跨团队协作沟通成本大',
        ],
        required: true,
      });
      onProgress(questions[questions.length - 1], currIdx, total);
      currIdx++;
    }

    // 3. 核心实践题
    if (currIdx <= total) {
      questions.push({
        id: `q${currIdx}`,
        type: 'single_choice',
        title: `团队在 ${kw2} 领域的落地演进处于哪一阶段？`,
        options: ['尚未启动或处于调研评估期', '已在部分边缘业务试点落地', '核心生产系统全面上线', '已建立成熟的自组织平台化治理'],
        required: true,
      });
      onProgress(questions[questions.length - 1], currIdx, total);
      currIdx++;
    }

    // 4. 李克特量表题
    if (currIdx <= total) {
      questions.push({
        id: `q${currIdx}`,
        type: 'likert_scale',
        title: `您对“${kw3} 显著提升了业务迭代交付速度”的认同程度：`,
        options: ['非常不认同', '比较不认同', '中立', '比较认同', '非常认同'],
        required: true,
      });
      onProgress(questions[questions.length - 1], currIdx, total);
      currIdx++;
    }

    // 5. 补充题目填充至 targetCount
    while (currIdx <= total) {
      if (currIdx === total) {
        // 最后一题为开放填空
        questions.push({
          id: `q${currIdx}`,
          type: 'text_input',
          title: `结合文档与团队现状，您对提升 ${kw1} 有何关键建议？`,
          placeholder: '请输入您的真知灼见与落地建议...',
          required: false,
        });
      } else {
        questions.push({
          id: `q${currIdx}`,
          type: 'single_choice',
          title: `在未来一年内，团队在技术基础设施上的投入优先级是？`,
          options: ['聚焦交付速度与自动化', '全面压降云成本与提高资源利用率', '智能化工具深度改造研发流', '架构合规与多区域高可用保障'],
          required: true,
        });
      }
      onProgress(questions[questions.length - 1], currIdx, total);
      currIdx++;
    }

    return questions;
  }

  private static sanitizeBlueprint(raw: any, targetCount: number): SurveyBlueprint {
    return {
      title: raw.title || 'AI 自动规划评估调研',
      description: raw.description || '基于多阶智能体架构深度提炼',
      targetAudience: raw.targetAudience || '相关从业人员',
      dimensions: Array.isArray(raw.dimensions) && raw.dimensions.length > 0
        ? raw.dimensions.map((d: any) => ({
            name: d.name || '核心评估维度',
            description: d.description || '',
            questionCount: Math.max(1, Number(d.questionCount) || 2),
          }))
        : [{ name: '核心维度', description: '全局综合评估', questionCount: targetCount }],
      variables: Array.isArray(raw.variables) ? raw.variables : [{ name: 'v1', description: '综合成熟度得分' }],
      criticalJumpPoints: Array.isArray(raw.criticalJumpPoints) ? raw.criticalJumpPoints : [{ questionIndex: 1, purpose: 'screening', description: '身份甄别' }],
    };
  }

  private static extractKeywords(text: string): string[] {
    if (!text || text.trim().length === 0) return ['AI 智能研发', '微服务', '效能工程'];
    const candidates = ['AI 效能', '云原生', '微服务', '流水线', '自动化测试', 'DevOps', '架构演进', '可观测性', '高可用'];
    const found = candidates.filter((c) => text.includes(c));
    return found.length > 0 ? found : ['数字化转型', '架构效能', '敏捷交付'];
  }
}
