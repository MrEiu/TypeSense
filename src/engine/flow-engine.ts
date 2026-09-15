/**
 * flow-engine.ts
 *
 * 工业级极简流转状态机引擎
 * 职责：
 * 1. 维护答题数据池（纯数字）与派生变量池（v1, v2...）；
 * 2. 默认按自然题号推进，在关键节点执行 jump 规则；
 * 3. 严格安全兜底（目标不存在时自动降级顺延，防环与防死锁）；
 * 4. 支持历史栈严格物理回退与动态题干变量插值。
 */

import type {
  QuestionItemModel,
  QuestionAnswerValue,
  JumpCondition,
} from '../schema/questionnaire-schema-types';

export interface FlowContext {
  answers: Record<string, QuestionAnswerValue>;
  variables: Record<string, number>;
  history: string[];
  currentCursor: string;
  status: 'in_progress' | 'completed' | 'disqualified';
  exitReason?: string;
}

export interface FlowEngineOptions {
  questions: QuestionItemModel[];
  initialCursor?: string;
  initialAnswers?: Record<string, QuestionAnswerValue>;
  initialHistory?: string[];
}

export interface FlowStepState {
  currentQuestion?: QuestionItemModel;
  isTerminal: boolean;
  status: 'in_progress' | 'completed' | 'disqualified';
  exitReason?: string;
  history: string[];
}

export class QuestionnaireFlowEngine {
  private questionsMap = new Map<string, QuestionItemModel>();
  private defaultSequence: string[] = [];
  private context: FlowContext;

  constructor(options: FlowEngineOptions) {
    options.questions.forEach((q) => {
      this.questionsMap.set(q.id, q);
      this.defaultSequence.push(q.id);
    });

    const startId = options.initialCursor || (this.defaultSequence[0] ?? '');

    this.context = {
      answers: { ...(options.initialAnswers || {}) },
      variables: {},
      history: [...(options.initialHistory || [])],
      currentCursor: startId,
      status: 'in_progress',
    };
  }

  /**
   * 获取当前上下文快照
   */
  public getContext(): Readonly<FlowContext> {
    return this.context;
  }

  /**
   * Synchronize or merge batch answers into the flow engine context
   */
  public setAnswers(answers: Record<string, QuestionAnswerValue>): void {
    this.context.answers = { ...this.context.answers, ...answers };
  }

  /**
   * 获取当前步骤状态
   */
  public getCurrentStep(): FlowStepState {
    const cursor = this.context.currentCursor;
    const isTerminal = this.context.status !== 'in_progress' || !cursor;
    const rawQuestion = this.questionsMap.get(cursor);

    // 动态文本变量插值
    const currentQuestion = rawQuestion ? this.interpolateQuestion(rawQuestion) : undefined;

    return {
      currentQuestion,
      isTerminal,
      status: this.context.status,
      exitReason: this.context.exitReason,
      history: [...this.context.history],
    };
  }

  /**
   * 提交答案并驱动状态机步进
   */
  public step(answer?: QuestionAnswerValue): FlowStepState {
    const cursor = this.context.currentCursor;
    if (!cursor || this.context.status !== 'in_progress') {
      return this.getCurrentStep();
    }

    const currentQ = this.questionsMap.get(cursor);
    if (currentQ) {
      // 1. 记录作答数值
      if (answer !== undefined) {
        this.context.answers[cursor] = answer;
      }
      this.context.history.push(cursor);

      // 2. 执行 set 计算公式 (如 { "v1": "q2 + q3" })
      if (currentQ.set) {
        this.evaluateSetFormulas(currentQ.set);
      }

      // 3. 计算下一跳目标
      const nextTarget = this.computeNextTarget(currentQ);
      this.applyTransition(nextTarget);
    } else {
      this.context.status = 'completed';
    }

    return this.getCurrentStep();
  }

  /**
   * 物理回退到历史上一节点
   */
  public rollbackTo(targetQuestionId: string): FlowStepState {
    this.context.currentCursor = targetQuestionId;
    this.context.status = 'in_progress';
    return this.getCurrentStep();
  }

  /**
   * 重置引擎状态
   */
  public reset(startId?: string): FlowStepState {
    this.context = {
      answers: {},
      variables: {},
      history: [],
      currentCursor: startId || (this.defaultSequence[0] ?? ''),
      status: 'in_progress',
    };
    return this.getCurrentStep();
  }

  /**
   * 依据 jump 规则或自然题号计算下一目标
   */
  private computeNextTarget(currentQ: QuestionItemModel): string {
    const jump = currentQ.jump;

    // 1. 关键节点无条件直跳 (如 "q7", "end", "exit")
    if (typeof jump === 'string' && jump.trim() !== '') {
      return jump.trim();
    }

    // 2. 关键节点多规则条件跳转
    if (Array.isArray(jump) && jump.length > 0) {
      for (const rule of jump) {
        if (rule.else) {
          return rule.to;
        }
        if (rule.when && this.matchRuleWhen(rule.when)) {
          return rule.to;
        }
      }
    }

    // 3. 默认自然题号递增
    return this.getNaturalNextId(currentQ.id);
  }

  /**
   * 状态转移与容错安全兜底
   */
  private applyTransition(target: string): void {
    if (target === 'end' || target === 'completed') {
      this.context.status = 'completed';
      this.context.currentCursor = '';
      return;
    }

    if (target === 'exit' || target === 'disqualified') {
      this.context.status = 'disqualified';
      this.context.exitReason = '受访者条件不满足本次问卷调研筛选范围。';
      this.context.currentCursor = '';
      return;
    }

    // 目标在题库中真实存在
    if (this.questionsMap.has(target)) {
      this.context.currentCursor = target;
      return;
    }

    // 容错兜底：目标题号不存在（如写错），自动降级顺延自然下一题
    console.warn(`[FlowEngine] 目标题目 "${target}" 不存在，自动降级顺延。`);
    const fallbackId = this.getNaturalNextId(this.context.currentCursor);
    if (fallbackId && this.questionsMap.has(fallbackId)) {
      this.context.currentCursor = fallbackId;
    } else {
      this.context.status = 'completed';
      this.context.currentCursor = '';
    }
  }

  /**
   * 获取自然序列的下一题 ID
   */
  private getNaturalNextId(currentId: string): string {
    const idx = this.defaultSequence.indexOf(currentId);
    if (idx !== -1 && idx + 1 < this.defaultSequence.length) {
      return this.defaultSequence[idx + 1];
    }
    return 'end';
  }

  /**
   * 判定多变量条件规则是否全量满足
   */
  private matchRuleWhen(whenMap: Record<string, JumpCondition>): boolean {
    for (const [targetKey, condition] of Object.entries(whenMap)) {
      const actualVal = this.context.variables[targetKey] ?? this.context.answers[targetKey];
      if (!this.checkSingleCondition(condition, actualVal)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 核心纯数值条件比对
   */
  private checkSingleCondition(
    condition: JumpCondition,
    actualVal: QuestionAnswerValue | number | undefined
  ): boolean {
    if (actualVal === undefined || actualVal === null) {
      return false;
    }

    // 1. 标量数字匹配 (如 when: 3)
    if (typeof condition === 'number') {
      if (Array.isArray(actualVal)) {
        return actualVal.includes(condition);
      }
      return actualVal === condition;
    }

    // 2. 候选数组匹配 (如 when: [0, 1])
    if (Array.isArray(condition)) {
      if (Array.isArray(actualVal)) {
        return actualVal.some((v) => condition.includes(v));
      }
      return typeof actualVal === 'number' && condition.includes(actualVal);
    }

    // 3. 对象结构操作符
    if (typeof condition === 'object') {
      // 包含算子 { has: 2 }
      if ('has' in condition && typeof condition.has === 'number') {
        return Array.isArray(actualVal) && actualVal.includes(condition.has);
      }

      // 数学比较算子 { ">=": 2, "<": 5 }
      if (typeof actualVal === 'number') {
        for (const [op, num] of Object.entries(condition)) {
          if (typeof num !== 'number') continue;
          if (op === '==' && !(actualVal === num)) return false;
          if (op === '!=' && !(actualVal !== num)) return false;
          if (op === '>' && !(actualVal > num)) return false;
          if (op === '<' && !(actualVal < num)) return false;
          if (op === '>=' && !(actualVal >= num)) return false;
          if (op === '<=' && !(actualVal <= num)) return false;
        }
        return true;
      }
    }

    return false;
  }

  /**
   * 安全执行数学算式并赋值局部变量池
   */
  private evaluateSetFormulas(setObj: Record<string, string | number>): void {
    for (const [varName, expr] of Object.entries(setObj)) {
      if (typeof expr === 'number') {
        this.context.variables[varName] = expr;
        continue;
      }

      if (typeof expr === 'string') {
        try {
          // 将表达式中的题号/变量名 (如 q1, v1) 替换为当前数值
          const sanitized = expr.replace(/\b([qv]\d+)\b/g, (_match, token) => {
            const val = this.context.variables[token] ?? this.context.answers[token];
            return typeof val === 'number' ? String(val) : '0';
          });

          // 仅允许纯数字、空格与基础四则运算符号，杜绝代码注入风险
          if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(sanitized)) {
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            const calculated = Function(`"use strict"; return (${sanitized});`)();
            if (typeof calculated === 'number' && !Number.isNaN(calculated)) {
              this.context.variables[varName] = calculated;
            }
          }
        } catch (err) {
          console.warn(`[FlowEngine] 变量算式计算失败 "${expr}":`, err);
        }
      }
    }
  }

  /**
   * 题干与描述文本动态插值 (支持 ${q1}, ${v1})
   */
  private interpolateQuestion(q: QuestionItemModel): QuestionItemModel {
    const replacePattern = /\$\{([qv]\d+)\}/g;
    const replacer = (_match: string, token: string) => {
      const val = this.context.variables[token] ?? this.context.answers[token];
      return val !== undefined && val !== null ? String(val) : '';
    };

    const title = q.title.replace(replacePattern, replacer);
    const description = q.description ? q.description.replace(replacePattern, replacer) : undefined;

    return {
      ...q,
      title,
      description,
    };
  }
}
