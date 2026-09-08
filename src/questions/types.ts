/**
 * types.ts
 *
 * Pluggable Question Architecture Contract
 *
 * Core principles:
 * 1. Zero Presets: No hardcoded fallback options or localized default labels.
 * 2. Multi-Surface: A single plugin definition serves both the interactive
 *    respondent runtime (Vue 3) and the topology canvas preview (DOM/Static).
 * 3. Numeric-First: Answers for selection and scale types are strictly
 *    0-indexed integers (number or number[]), enabling immediate formula evaluation.
 */

import type { Component } from 'vue';
import type { QuestionItemModel, QuestionAnswerValue } from '../schema/questionnaire-schema-types';

/**
 * Standard props received by interactive question components in the survey responder.
 */
export interface QuestionComponentProps<T = QuestionAnswerValue> {
  model: Readonly<QuestionItemModel>;
  value: T | null;
  disabled?: boolean;
}

/**
 * Standard events emitted by interactive question components.
 */
export interface QuestionComponentEmits<T = QuestionAnswerValue> {
  (e: 'update:value', value: T): void;
  (e: 'commit'): void;
}

/**
 * Context object provided for rendering canvas node cards and summary previews.
 */
export interface QuestionPreviewContext {
  model: Readonly<QuestionItemModel>;
  compact?: boolean;
}

/**
 * Unified Question Plugin Contract.
 * Every supported question type must strictly implement this interface.
 */
export interface QuestionPlugin<T = QuestionAnswerValue> {
  /** Unique question type identifier matching QuestionKind (e.g. 'single_choice', 'likert_scale') */
  readonly type: string;

  /** Human-readable technical label for documentation and admin metadata */
  readonly label: string;

  /** Technical description of the question plugin behavior */
  readonly description: string;

  /**
   * Interactive Vue 3 component for the survey responder.
   * Receives `QuestionComponentProps` and emits `QuestionComponentEmits`.
   */
  readonly component: Component;

  /**
   * Generates a lightweight, read-only HTMLElement for canvas topology cards.
   * Contains zero interactive listeners or timers for optimal layout performance.
   */
  renderPreview(context: QuestionPreviewContext): HTMLElement;

  /**
   * Pure validation function checking if the current answer satisfies schema constraints.
   */
  validateAnswer(model: QuestionItemModel, value: T | null | undefined): boolean;

  /**
   * Formats the raw answer (index, array of indices, or text) into a human-readable string.
   */
  formatValue(model: QuestionItemModel, value: T | null | undefined): string;
}

