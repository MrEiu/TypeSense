/**
 * server/ai/editor/index.ts
 *
 * Module entry point for questionnaire AI editor.
 * Re-exports router, agent, session, validator, and diff modules.
 */

export { aiEditorRouter } from '../../questionnaire-ai-editor/routes';
export {
  SurveyAiEditorAgent,
  type RunAgentOptions,
  type RunAgentResult,
} from '../../questionnaire-ai-editor/agent';
export {
  EditorSessionManager,
  type EditorSession,
  type ChatMessage,
} from '../../questionnaire-ai-editor/session';
export {
  SurveyValidator,
  SurveyValidator as SurveyStructureValidator,
  type ValidationResult,
} from '../../questionnaire-ai-editor/validator';
export {
  SurveyDiffCalculator,
  SurveyDiffCalculator as SurveyDiffEngine,
  type SurveyDiffSummary,
  type QuestionDiffItem,
} from '../../questionnaire-ai-editor/diff';
