/**
 * server/ai-chat-filler-service.ts
 *
 * Backward-compatibility proxy for SurveyFillerService.
 * Directs all consumers to server/ai/ modular implementation.
 * Scheduled for cleanup in Step 7.
 */

import { SurveyFillerService } from './ai';

export {
  type ExtractedAnswerUpdate,
  type ChatFillerRequest,
  type ChatFillerResponse,
} from './ai';

export const AiChatFillerService = SurveyFillerService;
