/**
 * src/composables/useSurveyEditor.ts
 *
 * Composable for AI interactive survey editor session state.
 * Manages session initialization, prompt submission, diff calculation,
 * and applying/discarding modifications.
 */

import { ref, computed } from 'vue';
import {
  AiEditorClientService,
  type EditorSessionData,
  type SurveyDiffSummary,
} from '../services/ai-editor-service';
import type { QuestionnaireModel } from '../schema/questionnaire-schema-types';

export function useSurveyEditor(notifyMsg?: any) {
  const loading = ref(false);
  const chatLoading = ref(false);
  const applyingLoading = ref(false);

  const session = ref<EditorSessionData | null>(null);
  const activeViewVersion = ref<'working' | 'original'>('working');
  const userPromptInput = ref('');

  const currentSurveyModel = computed<QuestionnaireModel | null>(() => {
    if (!session.value) return null;
    return activeViewVersion.value === 'working'
      ? session.value.workingSurvey
      : session.value.originalSurvey;
  });

  const diffSummary = computed<SurveyDiffSummary>(() => {
    return session.value?.diff || {
      addedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      titleChanged: false,
      descriptionChanged: false,
      changes: [],
      hasChanges: false,
    };
  });

  async function initSession(surveyId: string) {
    loading.value = true;
    try {
      const data = await AiEditorClientService.startSession(surveyId);
      session.value = data;
      activeViewVersion.value = 'working';
    } catch (err: any) {
      if (notifyMsg) notifyMsg.error(err.message || '初始化 AI 编辑会话失败');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function resetSession() {
    session.value = null;
    userPromptInput.value = '';
    activeViewVersion.value = 'working';
  }

  async function sendMessage() {
    if (!session.value || !userPromptInput.value.trim() || chatLoading.value) return;

    const promptText = userPromptInput.value.trim();
    userPromptInput.value = '';
    chatLoading.value = true;

    try {
      const res = await AiEditorClientService.sendChat(session.value.sessionId, promptText);
      session.value.workingSurvey = res.workingSurvey;
      session.value.chatHistory = res.chatHistory;
      session.value.diff = res.diff;
      activeViewVersion.value = 'working';
      if (notifyMsg) notifyMsg.success('AI 局部修改完成，请预览比对');
    } catch (err: any) {
      if (notifyMsg) notifyMsg.error(err.message || 'AI 修改执行失败');
    } finally {
      chatLoading.value = false;
    }
  }

  async function applyChanges(): Promise<string> {
    if (!session.value || applyingLoading.value) return '';
    applyingLoading.value = true;
    try {
      const res = await AiEditorClientService.applyChanges(session.value.sessionId);
      session.value.originalSurvey = res.appliedSurvey;
      session.value.diff = res.diff;
      if (notifyMsg) notifyMsg.success('修改已成功采纳并正式存盘！');
      return session.value.surveyId;
    } catch (err: any) {
      if (notifyMsg) notifyMsg.error(err.message || '保存修改失败');
      throw err;
    } finally {
      applyingLoading.value = false;
    }
  }

  async function discardChanges() {
    if (!session.value) return;
    try {
      const res = await AiEditorClientService.discardChanges(session.value.sessionId);
      session.value.workingSurvey = res.workingSurvey;
      session.value.diff = res.diff;
      activeViewVersion.value = 'working';
      if (notifyMsg) notifyMsg.info('已放弃修改并重置为原始版本');
    } catch (err: any) {
      if (notifyMsg) notifyMsg.error(err.message || '放弃修改失败');
    }
  }

  return {
    loading,
    chatLoading,
    applyingLoading,
    session,
    activeViewVersion,
    userPromptInput,
    currentSurveyModel,
    diffSummary,
    initSession,
    resetSession,
    sendMessage,
    applyChanges,
    discardChanges,
  };
}
