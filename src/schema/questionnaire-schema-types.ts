/**
 * questionnaire-schema-types.ts
 *
 * 工业级极简问卷数据契约定义
 * 核心原则：
 * 1. 题目 ID 严格为 q + 数字（如 q1, q2...），变量严格为 q 题号或 v + 数字（如 v1, v2...）；
 * 2. 选项作答结果严格为 0-indexed 纯数字（单选/量表为 0, 1...，多选为 [0, 2]...）；
 * 3. 默认自然题号递增，仅关键节点按需声明 jump 与 set 算式；
 * 4. 彻底杜绝冗余英文长名，极大缩减 AI 生成 Token 成本与幻觉风险。
 */

export type QuestionKind = 'single_choice' | 'multiple_choice' | 'text_input' | 'likert_scale';

export interface NormalizedOption {
  id: string;
  label: string;
}

export type RawOption = string | { id?: string; label?: string };

export type ComparisonOp = '==' | '!=' | '>' | '<' | '>=' | '<=';

export type JumpCondition =
  | number
  | number[]
  | { [key in ComparisonOp]?: number }
  | { has?: number };

/**
 * 关键节点流转规则
 */
export interface JumpRule {
  /** 触发条件：多变量键值比对，如 { "q1": 3 } 或 { "v1": { ">=": 2 }, "q7": 2 } */
  when?: Record<string, JumpCondition>;
  /** 兜底分支 */
  else?: boolean;
  /** 目标题目 ID (如 "q2") 或系统保留终态 ("end" 正常完成, "exit" 甄别淘汰) */
  to: string;
}

/**
 * 通用题目模型
 */
export interface QuestionItemModel {
  /** 题目唯一编号：严格格式为 q + 数字，如 q1, q2, q3 */
  id: string;
  type: QuestionKind;
  title: string;
  options?: RawOption[];
  /** 李克特量表捆绑子条目/陈述列表 */
  statements?: (string | { id?: string; label?: string })[];
  description?: string;
  placeholder?: string;
  required?: boolean;

  /** 局部计算变量设定：支持纯数学四则算式，如 { "v1": "q2 + q3" } 或 { "v1": 10 } */
  set?: Record<string, string | number>;

  /** 关键节点跳转流控：直接指定目标 "q7" 或多条件分支列表 */
  jump?: string | JumpRule[];
}

/**
 * 问卷顶级实体
 */
export interface QuestionnaireModel {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  status?: 'published' | 'paused';
  questions: QuestionItemModel[];
}

/**
 * 答题结果映射
 */
export type QuestionAnswerValue = number | number[] | string | Record<string, number> | null;

export interface QuestionAnswerMap {
  [questionId: string]: QuestionAnswerValue;
}

/**
 * 选项标准化辅助工具
 */
export function normalizeOptions(options?: RawOption[]): NormalizedOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((opt, index) => {
    if (typeof opt === 'string') {
      return { id: String(index), label: opt };
    }
    const label = opt.label || `选项 ${index + 1}`;
    const id = opt.id ?? String(index);
    return { id, label };
  });
}

/**
 * 李克特子条目标准化辅助工具
 */
export function normalizeStatements(statements?: (string | { id?: string; label?: string })[]): NormalizedOption[] {
  if (!Array.isArray(statements) || statements.length === 0) return [];
  return statements.map((item, index) => {
    if (typeof item === 'string') {
      return { id: String(index), label: item };
    }
    const label = item.label || `条目 ${index + 1}`;
    const id = item.id ?? String(index);
    return { id, label };
  });
}
