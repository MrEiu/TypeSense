/**
 * server/ai-generator-service.ts
 *
 * Backward-compatibility proxy for SurveyGeneratorService.
 * Directs all consumers to server/ai/ modular implementation.
 * Scheduled for cleanup in Step 7.
 */

import { SurveyGeneratorService } from './ai';

export {
  type GenerationOptions,
  type SurveyBlueprint,
  type SurveyBlockDefinition,
  type PipelineEvent,
} from './ai';

export const AiGeneratorService = SurveyGeneratorService;
