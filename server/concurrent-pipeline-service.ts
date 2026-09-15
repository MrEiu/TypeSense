/**
 * server/concurrent-pipeline-service.ts
 *
 * Backward-compatibility proxy for ConcurrentPipelineEngine.
 * Directs all consumers to server/ai/ modular implementation.
 * Scheduled for cleanup in Step 7.
 */

import { ConcurrentPipelineEngine } from './ai';

export {
  type SurveyTaskItem as SurveyTask,
  type SurveyTaskPlan,
  type PipelineSession,
  type ConcurrentPipelineEvent,
} from './ai';

export const ConcurrentPipelineService = ConcurrentPipelineEngine;
