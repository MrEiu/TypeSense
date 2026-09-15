/**
 * src/schema/types.ts
 *
 * Single Source of Truth (SSOT) domain types for TypeSense questionnaire system.
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
 * First-class Jump flow rule
 */
export interface JumpRule {
  id?: string;
  /** Originating question ID (e.g. "q1") when stored in top-level jumps table */
  from?: string;
  /** Destination question ID (e.g. "q3") or terminal state ("end" for normal finish, "exit" for screening drop) */
  to: string;
  /** Trigger condition matching variable values or question choices */
  when?: Record<string, JumpCondition>;
  /** Fallback default branch */
  else?: boolean;
}

/**
 * Question item specification
 */
export interface QuestionItemModel {
  /** Unique question identifier: strictly q + integer (e.g. q1, q2) or chunk temporary id (b1_1) */
  id: string;
  type: QuestionKind;
  title: string;
  options?: RawOption[];
  /** Sub-statements/dimensions for Likert scale matrices */
  statements?: (string | { id?: string; label?: string })[];
  description?: string;
  placeholder?: string;
  required?: boolean;

  /** Local variable derivations: mathematical expressions like { "v1": "q2 + q3" } */
  set?: Record<string, string | number>;

  /** Question-embedded flow control rules (maintained for bidirectional compatibility) */
  jump?: string | JumpRule[];
}

export type QuestionItem = QuestionItemModel;

/**
 * Authoritative Questionnaire Entity (SSOT)
 */
export interface QuestionnaireModel {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  status?: 'published' | 'paused';
  questions: QuestionItemModel[];
  /** Top-level first-class flow control rules */
  jumps?: JumpRule[];
  /** Global or derived variable definitions */
  variables?: Record<string, string | number>;
  /** Default AI speed-filling strategy */
  aiStrategy?: 'natural' | 'deep' | 'batch' | 'evidence' | 'adaptive';
  createdAt?: string;
  updatedAt?: string;
}

export type Questionnaire = QuestionnaireModel;

/**
 * Answer value representations
 */
export type QuestionAnswerValue = number | number[] | string | Record<string, number> | null;

export interface QuestionAnswerMap {
  [questionId: string]: QuestionAnswerValue;
}

/**
 * Response record entity
 */
export interface ResponseRecord {
  id: string;
  surveyId: string;
  answers: QuestionAnswerMap;
  status: 'completed' | 'screened_out' | 'in_progress';
  linkCode?: string;
  username?: string;
  userId?: string;
  createdAt: string;
}
