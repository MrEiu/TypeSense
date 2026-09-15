/**
 * src/composables/useSurveyFlow.ts
 *
 * Centralized state management composable for the questionnaire respondent flow.
 * Manages survey loading, flow engine progression, draft persistence, AI prefill synchronization,
 * and keyboard shortcuts.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import type {
  QuestionnaireModel,
  QuestionItemModel,
  QuestionAnswerMap,
} from '../schema/questionnaire-schema-types';
import { QuestionnaireRepositoryService } from '../services/questionnaire-repository-service';
import { QuestionnaireFlowEngine, type FlowStepState } from '../engine/flow-engine';
import { DraftStorageService, type SurveyDraftData } from '../services/draft-storage-service';
import { AuthClientService, type UserProfile } from '../services/auth-client-service';

export function useSurveyFlow() {
  // Authentication & Dialogs
  const currentUser = ref<UserProfile | null>(AuthClientService.getUser());
  const showAuthModal = ref(false);
  const showAiChatFiller = ref(false);
  let pendingAction: 'start' | 'aiFill' | null = null;

  // Survey & Progression State
  const loading = ref(true);
  const error = ref<string | null>(null);
  const survey = ref<QuestionnaireModel | null>(null);
  const stage = ref<'welcome' | 'question' | 'completed' | 'disqualified'>('welcome');
  const currentStep = ref<FlowStepState | null>(null);
  const currentAnswer = ref<unknown>(undefined);
  const answersMap = ref<Record<string, unknown>>({});
  const historyStack = ref<string[]>([]);
  const isSubmitting = ref(false);
  const responseId = ref<string>('');
  const disqualifiedReason = ref<string>('');
  const questionStageRef = ref<{ triggerShake: () => void } | null>(null);

  // AI prefilled questions tracker
  const aiRecordedQuestionIds = ref<Set<string>>(new Set());

  // Draft state
  const existingDraft = ref<SurveyDraftData | null>(null);
  const draftSavedTime = ref<string>('');

  let engine: QuestionnaireFlowEngine | null = null;
  let linkCode: string | undefined = undefined;

  // Active question reference
  const currentQuestion = computed<QuestionItemModel | undefined>(() => {
    return currentStep.value?.currentQuestion;
  });

  // Total questions count
  const totalQuestions = computed(() => {
    return survey.value?.questions?.length || 1;
  });

  // Answered questions count
  const answeredCount = computed(() => {
    return Object.keys(answersMap.value).filter((k) => {
      const v = answersMap.value[k];
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }).length;
  });

  // Current sequence index (1-based)
  const currentSeqNumber = computed(() => {
    if (!survey.value || !currentQuestion.value) return 1;
    const idx = survey.value.questions.findIndex((q) => q.id === currentQuestion.value?.id);
    return idx >= 0 ? idx + 1 : historyStack.value.length + 1;
  });

  // Progress percentage
  const progressPercentage = computed(() => {
    if (stage.value === 'completed') return 100;
    if (stage.value === 'welcome') return 0;
    const current = currentSeqNumber.value;
    const total = totalQuestions.value;
    return Math.min(100, Math.round(((current - 1) / total) * 100));
  });

  // Whether active question is the last one
  const isLastQuestion = computed(() => {
    if (!survey.value || !currentQuestion.value) return false;
    return currentSeqNumber.value >= totalQuestions.value;
  });

  // Persist current draft to local storage
  function saveCurrentDraft() {
    if (!survey.value || !currentQuestion.value) return;
    DraftStorageService.saveDraft(survey.value.id, {
      cursor: currentQuestion.value.id,
      answers: answersMap.value,
      history: historyStack.value,
      totalQuestions: totalQuestions.value,
    });
    const now = new Date();
    draftSavedTime.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Load survey data and initialize flow engine
  async function initSurvey() {
    loading.value = true;
    error.value = null;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const surveyId = urlParams.get('id') || urlParams.get('survey');
      linkCode = urlParams.get('link') || undefined;

      if (!surveyId || surveyId.trim() === '') {
        error.value = '未指定问卷专属访问参数。请从管理控制台获取专属访问链接或使用带有 ?id=xxx 参数的链接访问。';
        loading.value = false;
        return;
      }

      const loadedSurvey = await QuestionnaireRepositoryService.getSurvey(surveyId.trim());
      survey.value = loadedSurvey;

      if (loadedSurvey.status === 'paused') {
        error.value = '该问卷当前已暂停收集答卷，感谢您的关注！';
        loading.value = false;
        return;
      }

      // Check for existing local draft
      const draft = DraftStorageService.getDraft(loadedSurvey.id);
      if (draft && draft.answeredCount > 0) {
        existingDraft.value = draft;
      }

      // Initialize flow engine
      engine = new QuestionnaireFlowEngine({
        questions: loadedSurvey.questions,
      });

      const initialStep = engine.getCurrentStep();
      currentStep.value = initialStep;
      stage.value = 'welcome';
    } catch (err) {
      console.error('[SurveyFlow] Failed to load survey:', err);
      error.value = '无法加载问卷，该问卷可能不存在或已被删除。';
    } finally {
      loading.value = false;
    }
  }

  // Resume draft and proceed
  function handleResumeDraft() {
    if (!AuthClientService.isLoggedIn()) {
      showAuthModal.value = true;
      return;
    }
    if (!existingDraft.value || !survey.value) return;
    const draft = existingDraft.value;
    answersMap.value = { ...draft.answers };
    historyStack.value = [...draft.history];

    engine = new QuestionnaireFlowEngine({
      questions: survey.value.questions,
      initialCursor: draft.cursor,
      initialAnswers: draft.answers as any,
      initialHistory: draft.history,
    });

    const step = engine.getCurrentStep();
    currentStep.value = step;
    if (step.currentQuestion) {
      currentAnswer.value = answersMap.value[step.currentQuestion.id];
    }
    existingDraft.value = null;
    stage.value = 'question';
  }

  // Discard local draft
  function handleDiscardDraft() {
    if (survey.value) {
      DraftStorageService.clearDraft(survey.value.id);
    }
    existingDraft.value = null;
  }

  // Update answer on option/text change
  function handleUpdateAnswer(val: unknown) {
    currentAnswer.value = val;
    if (currentQuestion.value) {
      answersMap.value[currentQuestion.value.id] = val;
      saveCurrentDraft();
    }
  }

  // Start survey flow from welcome card
  function handleStart() {
    if (!AuthClientService.isLoggedIn()) {
      pendingAction = 'start';
      showAuthModal.value = true;
      return;
    }
    if (!engine) return;
    const step = engine.getCurrentStep();
    currentStep.value = step;
    if (step.currentQuestion) {
      currentAnswer.value = answersMap.value[step.currentQuestion.id];
    }
    stage.value = 'question';
  }

  // Open AI chat filler modal
  function handleOpenAiFill() {
    if (!AuthClientService.isLoggedIn()) {
      pendingAction = 'aiFill';
      showAuthModal.value = true;
      return;
    }
    showAiChatFiller.value = true;
  }

  // Handle auth success callback
  function onAuthSuccess(user: UserProfile) {
    currentUser.value = user;
    showAuthModal.value = false;
    if (pendingAction === 'aiFill') {
      pendingAction = null;
      showAiChatFiller.value = true;
    } else if (stage.value === 'welcome') {
      pendingAction = null;
      handleStart();
    }
  }

  // Handle user logout
  function handleUserLogout() {
    AuthClientService.logout();
    currentUser.value = null;
  }

  // Synchronize AI filler answers
  function handleSyncAiAnswers(updatedAnswers: QuestionAnswerMap) {
    answersMap.value = { ...answersMap.value, ...updatedAnswers };
    if (engine) {
      engine.setAnswers(updatedAnswers as any);
    }
    for (const qId of Object.keys(updatedAnswers)) {
      aiRecordedQuestionIds.value.add(qId);
    }
    saveCurrentDraft();

    if (currentQuestion.value && answersMap.value[currentQuestion.value.id] !== undefined) {
      currentAnswer.value = answersMap.value[currentQuestion.value.id];
    }
  }

  // Auto transition into question stage after AI finish
  function handleAiFinish() {
    if (stage.value === 'welcome') {
      if (!AuthClientService.isLoggedIn()) {
        pendingAction = 'start';
        showAuthModal.value = true;
        return;
      }
      if (!engine) return;
      const step = engine.getCurrentStep();
      currentStep.value = step;
      if (step.currentQuestion) {
        currentAnswer.value = answersMap.value[step.currentQuestion.id];
      }
      stage.value = 'question';
    }
  }

  // Validate required answer
  function validateCurrentAnswer(): boolean {
    if (!currentQuestion.value) return true;
    if (currentQuestion.value.required === false) return true;

    const val = currentAnswer.value;
    if (val === undefined || val === null || val === '') {
      return false;
    }
    if (Array.isArray(val) && val.length === 0) {
      return false;
    }
    return true;
  }

  // Advance to next step or submit
  async function handleNext() {
    if (isSubmitting.value || !engine || !currentQuestion.value) return;

    if (!validateCurrentAnswer()) {
      if (questionStageRef.value?.triggerShake) {
        questionStageRef.value.triggerShake();
      }
      return;
    }

    const qId = currentQuestion.value.id;
    answersMap.value[qId] = currentAnswer.value;
    historyStack.value.push(qId);

    const nextStep = engine.step(currentAnswer.value as any);
    currentStep.value = nextStep;

    if (nextStep.status === 'completed' || nextStep.isTerminal) {
      await submitFinalResponse('completed');
      return;
    }

    if (nextStep.status === 'disqualified') {
      disqualifiedReason.value = nextStep.exitReason || '很遗憾，您的条件暂不符合本次问卷的调研范围。';
      await submitFinalResponse('disqualified');
      stage.value = 'disqualified';
      return;
    }

    if (nextStep.currentQuestion) {
      currentAnswer.value = answersMap.value[nextStep.currentQuestion.id];
      saveCurrentDraft();
    } else {
      currentAnswer.value = undefined;
    }
  }

  // Rollback to previous step
  function handlePrev() {
    if (!engine || historyStack.value.length === 0) return;

    const prevId = historyStack.value.pop();
    if (!prevId) return;

    const prevStep = engine.rollbackTo(prevId);
    currentStep.value = prevStep;
    if (prevStep.currentQuestion) {
      currentAnswer.value = answersMap.value[prevStep.currentQuestion.id];
      saveCurrentDraft();
    }
  }

  // Final response persistence
  async function submitFinalResponse(status: 'completed' | 'disqualified') {
    if (!survey.value) return;
    isSubmitting.value = true;

    try {
      const res = await QuestionnaireRepositoryService.submitResponse(survey.value.id, {
        answers: answersMap.value,
        status,
        linkCode,
        username: currentUser.value?.username || 'anonymous',
        userId: currentUser.value?.id || '',
      });

      if (res.success && res.id) {
        responseId.value = res.id;
      }

      DraftStorageService.clearDraft(survey.value.id);
      existingDraft.value = null;
    } catch (err) {
      console.error('[SurveyFlow] Submit response error:', err);
    } finally {
      isSubmitting.value = false;
      if (status === 'completed') {
        stage.value = 'completed';
      }
    }
  }

  // Restart questionnaire
  function handleRestart() {
    if (!engine || !survey.value) return;
    answersMap.value = {};
    historyStack.value = [];
    currentAnswer.value = undefined;
    DraftStorageService.clearDraft(survey.value.id);
    existingDraft.value = null;
    const initialStep = engine.reset();
    currentStep.value = initialStep;
    stage.value = 'welcome';
  }

  // Global keyboard shortcuts (Enter to advance, A-Z for options)
  function handleGlobalKeydown(e: KeyboardEvent) {
    const activeEl = document.activeElement;
    const isTyping =
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable);

    if (e.key === 'Enter') {
      if (stage.value === 'welcome') {
        e.preventDefault();
        handleStart();
        return;
      }
      if (stage.value === 'question' && !e.shiftKey) {
        if (activeEl?.tagName === 'TEXTAREA' && e.shiftKey) return;
        e.preventDefault();
        handleNext();
        return;
      }
    }

    if (stage.value === 'question' && !isTyping) {
      const key = e.key.toUpperCase();
      if (key >= 'A' && key <= 'Z' && currentQuestion.value) {
        const idx = key.charCodeAt(0) - 65;
        const optionsCount = currentQuestion.value.options?.length || 0;
        if (idx < optionsCount) {
          e.preventDefault();
          if (currentQuestion.value.type === 'single_choice') {
            currentAnswer.value = idx;
            setTimeout(() => {
              handleNext();
            }, 220);
          } else if (currentQuestion.value.type === 'multiple_choice') {
            const current = Array.isArray(currentAnswer.value) ? [...currentAnswer.value] : [];
            const found = current.indexOf(idx);
            if (found >= 0) {
              current.splice(found, 1);
            } else {
              current.push(idx);
            }
            currentAnswer.value = current.sort((a, b) => a - b);
          }
        }
      }
    }
  }

  const handleAuthChange = (e: Event) => {
    const customEvt = e as CustomEvent<UserProfile | null>;
    currentUser.value = customEvt.detail;
  };

  onMounted(() => {
    initSurvey();
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('typesense:auth-changed', handleAuthChange);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeydown);
    window.removeEventListener('typesense:auth-changed', handleAuthChange);
  });

  return {
    // State
    currentUser,
    showAuthModal,
    showAiChatFiller,
    loading,
    error,
    survey,
    stage,
    currentStep,
    currentQuestion,
    currentAnswer,
    answersMap,
    historyStack,
    isSubmitting,
    responseId,
    disqualifiedReason,
    questionStageRef,
    aiRecordedQuestionIds,
    existingDraft,
    draftSavedTime,
    totalQuestions,
    answeredCount,
    currentSeqNumber,
    progressPercentage,
    isLastQuestion,

    // Actions
    initSurvey,
    handleResumeDraft,
    handleDiscardDraft,
    handleUpdateAnswer,
    handleStart,
    handleOpenAiFill,
    onAuthSuccess,
    handleUserLogout,
    handleSyncAiAnswers,
    handleAiFinish,
    handleNext,
    handlePrev,
    handleRestart,
  };
}
