<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  NButton,
  NSpin,
  type GlobalThemeOverrides,
} from 'naive-ui';
import { ChevronLeft, ChevronRight, CornerDownLeft, History, ArrowRight, Check, Sparkles } from 'lucide-vue-next';

import type { QuestionnaireModel, QuestionItemModel, QuestionAnswerMap } from '../schema/questionnaire-schema-types';
import { QuestionnaireRepositoryService } from '../services/questionnaire-repository-service';
import { QuestionnaireFlowEngine, type FlowStepState } from '../engine/flow-engine';
import { DraftStorageService, type SurveyDraftData } from '../services/draft-storage-service';
import { AuthClientService, type UserProfile } from '../services/auth-client-service';

import WelcomeCard from './components/WelcomeCard.vue';
import QuestionStage from './components/QuestionStage.vue';
import CompletionCard from './components/CompletionCard.vue';
import DisqualifiedCard from './components/DisqualifiedCard.vue';
import AuthModal from '../components/auth/AuthModal.vue';
import AiSurveyChatFillerModal from './components/AiSurveyChatFillerModal.vue';

// Naive UI Zen Paper 极简书卷主题定制
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#4f46e5',
    primaryColorHover: '#4338ca',
    primaryColorPressed: '#3730a3',
    primaryColorSuppl: '#4f46e5',
    borderRadius: '10px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  Button: {
    fontWeight: '600',
    borderRadiusMedium: '10px',
  },
};

// 状态定义
const currentUser = ref<UserProfile | null>(AuthClientService.getUser());
const showAuthModal = ref(false);
const showAiChatFiller = ref(false);
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

// AI speed-fill recorded question ID set
const aiRecordedQuestionIds = ref<Set<string>>(new Set());
let pendingAction: 'start' | 'aiFill' | null = null;

// 草稿暂存状态
const existingDraft = ref<SurveyDraftData | null>(null);
const draftSavedTime = ref<string>('');

let engine: QuestionnaireFlowEngine | null = null;
let linkCode: string | undefined = undefined;

// 当前题目模型
const currentQuestion = computed<QuestionItemModel | undefined>(() => {
  return currentStep.value?.currentQuestion;
});

// 题目总数与当前序号
const totalQuestions = computed(() => {
  return survey.value?.questions?.length || 1;
});

// Total answered questions count
const answeredCount = computed(() => {
  return Object.keys(answersMap.value).filter((k) => {
    const v = answersMap.value[k];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;
});

const currentSeqNumber = computed(() => {
  if (!survey.value || !currentQuestion.value) return 1;
  const idx = survey.value.questions.findIndex((q) => q.id === currentQuestion.value?.id);
  return idx >= 0 ? idx + 1 : historyStack.value.length + 1;
});

// 作答进度百分比
const progressPercentage = computed(() => {
  if (stage.value === 'completed') return 100;
  if (stage.value === 'welcome') return 0;
  const current = currentSeqNumber.value;
  const total = totalQuestions.value;
  return Math.min(100, Math.round(((current - 1) / total) * 100));
});

// 是否处于最后一题
const isLastQuestion = computed(() => {
  if (!survey.value || !currentQuestion.value) return false;
  return currentSeqNumber.value >= totalQuestions.value;
});

// 保存草稿至本地缓存
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

// 初始化问卷数据与引擎
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

    // 检查本地是否存在有效草稿
    const draft = DraftStorageService.getDraft(loadedSurvey.id);
    if (draft && draft.answeredCount > 0) {
      existingDraft.value = draft;
    }

    // 构建逻辑引擎
    engine = new QuestionnaireFlowEngine({
      questions: loadedSurvey.questions,
    });

    const initialStep = engine.getCurrentStep();
    currentStep.value = initialStep;

    stage.value = 'welcome';
  } catch (err) {
    console.error('[SurveyApp] 装载问卷失败:', err);
    error.value = `无法加载问卷，该问卷可能不存在或已被删除。`;
  } finally {
    loading.value = false;
  }
}

// 恢复草稿并继续答题
function handleResumeDraft() {
  if (!AuthClientService.isLoggedIn()) {
    showAuthModal.value = true;
    return;
  }
  if (!existingDraft.value || !survey.value) return;
  const draft = existingDraft.value;
  answersMap.value = { ...draft.answers };
  historyStack.value = [...draft.history];

  // 从草稿断点重启逻辑状态机
  engine = new QuestionnaireFlowEngine({
    questions: survey.value.questions,
    initialCursor: draft.cursor,
    initialAnswers: draft.answers,
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

// 放弃草稿重头开始
function handleDiscardDraft() {
  if (survey.value) {
    DraftStorageService.clearDraft(survey.value.id);
  }
  existingDraft.value = null;
}

// 选项或文本变更时即时暂存
function handleUpdateAnswer(val: unknown) {
  currentAnswer.value = val;
  if (currentQuestion.value) {
    answersMap.value[currentQuestion.value.id] = val;
    saveCurrentDraft();
  }
}

// 开始答题（严格校验已登录状态）
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

// One-click AI quick-fill entry from welcome card
function handleOpenAiFill() {
  if (!AuthClientService.isLoggedIn()) {
    pendingAction = 'aiFill';
    showAuthModal.value = true;
    return;
  }
  showAiChatFiller.value = true;
}

// 鉴权登录成功回调
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

// 退出受访账号
function handleUserLogout() {
  AuthClientService.logout();
  currentUser.value = null;
}

// 接收并合并 AI 对话填写的答案
function handleSyncAiAnswers(updatedAnswers: QuestionAnswerMap, newCount: number) {
  answersMap.value = { ...answersMap.value, ...updatedAnswers };
  if (engine) {
    engine.setAnswers(updatedAnswers as any);
  }
  for (const qId of Object.keys(updatedAnswers)) {
    aiRecordedQuestionIds.value.add(qId);
  }
  saveCurrentDraft();

  // 若当前停留的题目已有新提取的答案，实时联动更新当前答案
  if (currentQuestion.value && answersMap.value[currentQuestion.value.id] !== undefined) {
    currentAnswer.value = answersMap.value[currentQuestion.value.id];
  }
}

// Auto transition into questionnaire stage after AI finish
function handleAiFinish(newCount: number) {
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

// 检查当前题目必填校验
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

// 下一步推进
async function handleNext() {
  if (isSubmitting.value || !engine || !currentQuestion.value) return;

  // 1. 必填校验
  if (!validateCurrentAnswer()) {
    if (questionStageRef.value?.triggerShake) {
      questionStageRef.value.triggerShake();
    }
    return;
  }

  // 2. 暂存当前作答
  const qId = currentQuestion.value.id;
  answersMap.value[qId] = currentAnswer.value;
  historyStack.value.push(qId);

  // 3. 驱动逻辑引擎步进
  const nextStep = engine.step(currentAnswer.value as any);
  currentStep.value = nextStep;

  // 4. 判定终止态
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

  // 5. 载入下一题答案并实时落盘草稿
  if (nextStep.currentQuestion) {
    currentAnswer.value = answersMap.value[nextStep.currentQuestion.id];
    saveCurrentDraft();
  } else {
    currentAnswer.value = undefined;
  }
}

// 回退上一题
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

// 提交答卷入库持久化（成功后物理销毁草稿）
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

    // 清空本地草稿
    DraftStorageService.clearDraft(survey.value.id);
    existingDraft.value = null;
  } catch (err) {
    console.error('[SurveyApp] 答卷入库持久化异常:', err);
  } finally {
    isSubmitting.value = false;
    if (status === 'completed') {
      stage.value = 'completed';
    }
  }
}

// 重新作答
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

// 全局快捷键驱动 (Enter 推进、A-D 单选选择)
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

  // 选项快捷选择 (A - Z)
  if (stage.value === 'question' && !isTyping) {
    const key = e.key.toUpperCase();
    if (key >= 'A' && key <= 'Z' && currentQuestion.value) {
      const idx = key.charCodeAt(0) - 65; // A -> 0, B -> 1 ...
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
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="survey-screen-container">
        <!-- 顶部温润微进度条 -->
        <div class="header-progress-wrap" v-if="stage === 'question'">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${progressPercentage}%` }"></div>
          </div>
        </div>

        <!-- 顶部温润受访者导航条 -->
        <header class="responder-nav-bar">
          <div class="nav-brand">
            <span class="brand-spark">⚡</span>
            <span class="brand-title">TypeSense</span>
          </div>

          <div class="nav-user-area">
            <!-- AI 对话速填入口 -->
            <button
              v-if="survey && stage !== 'completed' && stage !== 'disqualified'"
              type="button"
              class="nav-ai-btn"
              title="通过与 AI 自然交流提炼问卷答案"
              @click="showAiChatFiller = true"
            >
              <Sparkles class="nav-ai-icon" />
              <span>AI 对话速填</span>
            </button>

            <template v-if="currentUser">
              <div class="user-badge">
                <span class="user-indicator"></span>
                <span class="user-name">当前受访者：<strong>{{ currentUser.username }}</strong></span>
                <button class="user-btn-ghost" @click="handleUserLogout" title="退出并切换账号">
                  退出
                </button>
              </div>
            </template>
            <template v-else>
              <button class="user-login-cta" @click="showAuthModal = true">
                登录 / 注册受访者账号
              </button>
            </template>
          </div>
        </header>

        <!-- 骨架加载态 -->
        <div v-if="loading" class="state-center-box">
          <NSpin size="large" />
          <p class="loading-hint">正在准备专属问卷体验...</p>
        </div>

        <!-- 异常提示态 -->
        <div v-else-if="error" class="state-center-box">
          <div class="error-card">
            <div class="error-badge">✕</div>
            <h3 class="error-title">无法开始问卷</h3>
            <p class="error-desc">{{ error }}</p>
            <div class="error-action">
              <NButton type="primary" secondary @click="window.location.href = '/'">
                返回问卷管理台
              </NButton>
            </div>
          </div>
        </div>

        <!-- 主作答流程视图 -->
        <main v-else class="survey-main-viewport">
          <!-- 阶段 1：欢迎屏 -->
          <div v-if="stage === 'welcome' && survey" class="welcome-container">
            <!-- 历史草稿恢复卡片 -->
            <div v-if="existingDraft" class="draft-resume-card">
              <div class="draft-card-header">
                <div class="draft-icon-bubble">
                  <History class="draft-header-icon" />
                </div>
                <div class="draft-info-block">
                  <div class="draft-title-row">
                    <span class="draft-title">检测到上次未完成的作答草稿</span>
                    <span class="draft-pill">已作答 {{ existingDraft.answeredCount }} / {{ totalQuestions }} 题</span>
                  </div>
                  <div class="draft-desc">
                    草稿已安全暂存在本设备，点击即可恢复作答现场，继续未完的题目。
                  </div>
                </div>
              </div>

              <div class="draft-action-row">
                <button class="draft-btn resume-btn" @click="handleResumeDraft">
                  <span>恢复草稿并继续</span>
                  <ArrowRight class="draft-btn-icon" />
                </button>
                <button class="draft-btn discard-btn" @click="handleDiscardDraft">
                  <span>放弃草稿从头开始</span>
                </button>
              </div>
            </div>

            <WelcomeCard
              :title="survey.title"
              :description="survey.description"
              :estimated-minutes="Math.max(2, Math.ceil(totalQuestions / 2))"
              :total-questions="totalQuestions"
              @start="handleStart"
              @ai-fill="handleOpenAiFill"
            />
          </div>

          <!-- 阶段 2：题目交互主舞台 -->
          <div v-else-if="stage === 'question' && currentQuestion" class="stage-stage-wrap">
            <QuestionStage
              ref="questionStageRef"
              :question="currentQuestion"
              :seq-number="currentSeqNumber"
              :total-questions="totalQuestions"
              :current-answer="currentAnswer"
              :is-ai-prefilled="currentQuestion ? aiRecordedQuestionIds.has(currentQuestion.id) : false"
              @update:answer="handleUpdateAnswer"
              @next="handleNext"
            />
          </div>

          <!-- 阶段 3：成功完成屏 -->
          <CompletionCard
            v-else-if="stage === 'completed' && survey"
            :survey-title="survey.title"
            :response-id="responseId"
            @restart="handleRestart"
          />

          <!-- 阶段 4：甄别淘汰屏 -->
          <DisqualifiedCard
            v-else-if="stage === 'disqualified'"
            :reason="disqualifiedReason"
            @restart="handleRestart"
          />
        </main>

        <!-- 底部悬浮控制坞 (仅在答题态展示) -->
        <nav v-if="stage === 'question'" class="floating-dock-bar">
          <div class="dock-inner">
            <!-- 上一题按钮 -->
            <button
              class="dock-nav-btn prev-btn"
              :disabled="historyStack.length === 0"
              title="回退上一题"
              @click="handlePrev"
            >
              <ChevronLeft class="dock-icon" />
              <span class="dock-btn-label">上一题</span>
            </button>

            <!-- 序号与进度指示 -->
            <div class="dock-counter">
              <span class="counter-curr">{{ currentSeqNumber }}</span>
              <span class="counter-divider">/</span>
              <span class="counter-total">{{ totalQuestions }}</span>
              <span v-if="answeredCount > 0" class="counter-answered">· 已作答 {{ answeredCount }} 题</span>
            </div>

            <!-- 下一步 / 提交按钮 (低存在感，与上一题一致) -->
            <button
              class="dock-nav-btn next-btn"
              :disabled="isSubmitting"
              :title="isLastQuestion ? '完成并提交问卷' : '进入下一题'"
              @click="handleNext"
            >
              <span class="dock-btn-label">{{ isLastQuestion ? '完成提交' : '下一题' }}</span>
              <ChevronRight class="dock-icon" />
            </button>
          </div>
        </nav>

        <!-- 受访者身份登录 / 注册弹窗 -->
        <AuthModal
          v-model:show="showAuthModal"
          mode="user"
          :closable="true"
          @success="onAuthSuccess"
        />

        <!-- AI 自然对话辅助速填弹窗 -->
        <AiSurveyChatFillerModal
          v-if="survey"
          v-model:show="showAiChatFiller"
          :survey="survey"
          :initial-answers="(answersMap as QuestionAnswerMap)"
          @sync-answers="handleSyncAiAnswers"
          @finish="handleAiFinish"
        />
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.survey-screen-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--zen-bg);
  position: relative;
  overflow-x: hidden;
}

/* 顶部受访者导航条 */
.responder-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(15, 23, 42, 0.05);
  position: relative;
  z-index: 50;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-spark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: #4f46e5;
  color: #fff;
  border-radius: 6px;
  font-size: 0.85rem;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
}

.brand-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.nav-user-area {
  display: flex;
  align-items: center;
}

.nav-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(124, 58, 237, 0.12));
  border: 1px solid rgba(124, 58, 237, 0.25);
  color: #6366f1;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  margin-right: 12px;
  transition: all 0.2s ease;
  outline: none;
}

.nav-ai-btn:hover {
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(124, 58, 237, 0.22));
  color: #4f46e5;
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.2);
}

.nav-ai-icon {
  width: 14px;
  height: 14px;
}

.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.user-indicator {
  width: 7px;
  height: 7px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.user-name {
  font-size: 0.84rem;
  color: #475569;
}

.user-name strong {
  color: #0f172a;
}

.user-btn-ghost {
  background: transparent;
  border: none;
  font-size: 0.8rem;
  color: #64748b;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.user-btn-ghost:hover {
  background: #f1f5f9;
  color: #dc2626;
}

.user-login-cta {
  background: #4f46e5;
  color: #ffffff;
  border: none;
  font-size: 0.84rem;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
}

.user-login-cta:hover {
  background: #4338ca;
  transform: translateY(-1px);
}

/* 顶部进度条 */
.header-progress-wrap {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(15, 23, 42, 0.04);
  z-index: 100;
}

.progress-track {
  width: 100%;
  height: 100%;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--zen-primary);
  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 8px rgba(79, 70, 229, 0.4);
}

/* 加载中与居中态 */
.state-center-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.loading-hint {
  margin-top: 16px;
  font-size: 0.95rem;
  color: var(--zen-text-secondary);
  font-weight: 500;
}

/* 异常卡片 */
.error-card {
  max-width: 480px;
  width: 100%;
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: var(--zen-radius-lg);
  padding: 36px 28px;
  text-align: center;
  box-shadow: var(--zen-shadow-md);
}

.error-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--zen-danger-subtle);
  color: var(--zen-danger);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 16px;
}

.error-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--zen-text-primary);
  margin: 0 0 10px 0;
}

.error-desc {
  font-size: 0.92rem;
  color: var(--zen-text-secondary);
  line-height: 1.6;
  margin: 0 0 24px 0;
}

/* 主视图区域 */
.survey-main-viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 20px 100px 20px;
  max-width: 780px;
  width: 100%;
  margin: 0 auto;
}

.stage-stage-wrap {
  width: 100%;
}

/* 底部悬浮控制坞 */
.floating-dock-bar {
  position: fixed;
  bottom: 24px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 90;
}

.dock-inner {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--zen-border);
  box-shadow: var(--zen-shadow-lg);
  border-radius: var(--zen-radius-full);
  padding: 6px 10px;
}

.dock-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--zen-radius-full);
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--zen-transition-fast);
}

.dock-nav-btn.prev-btn {
  background: transparent;
  color: var(--zen-text-secondary);
}

.dock-nav-btn.prev-btn:hover:not(:disabled) {
  background: var(--zen-surface-hover);
  color: var(--zen-text-primary);
}

.dock-nav-btn.prev-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.dock-nav-btn.next-btn {
  background: transparent;
  color: var(--zen-text-secondary);
  box-shadow: none;
}

.dock-nav-btn.next-btn:hover:not(:disabled) {
  background: var(--zen-surface-hover);
  color: var(--zen-text-primary);
  box-shadow: none;
}

.dock-nav-btn.next-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.dock-icon {
  width: 16px;
  height: 16px;
}

.dock-counter {
  padding: 0 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--zen-text-muted);
  user-select: none;
}

.counter-answered {
  margin-left: 6px;
  color: #4f46e5;
  font-weight: 600;
  font-size: 0.8rem;
}

.counter-curr {
  color: var(--zen-text-primary);
  font-weight: 700;
}

.counter-divider {
  margin: 0 4px;
}

/* 草稿恢复与暂存卡片 */
.welcome-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.draft-resume-card {
  background: #ffffff;
  border: 1.5px solid rgba(79, 70, 229, 0.25);
  border-radius: var(--zen-radius-md);
  padding: 20px 24px;
  box-shadow: 0 4px 16px -2px rgba(79, 70, 229, 0.08);
  animation: slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.draft-card-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.draft-icon-bubble {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--zen-primary-subtle);
  color: var(--zen-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.draft-header-icon {
  width: 20px;
  height: 20px;
}

.draft-info-block {
  flex-grow: 1;
}

.draft-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.draft-title {
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--zen-text-primary);
}

.draft-pill {
  font-size: 0.76rem;
  font-weight: 600;
  background: var(--zen-primary-subtle);
  color: var(--zen-primary-active);
  padding: 2px 8px;
  border-radius: var(--zen-radius-full);
}

.draft-desc {
  font-size: 0.88rem;
  color: var(--zen-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.draft-action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 56px;
}

.draft-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--zen-transition-fast);
}

.draft-btn.resume-btn {
  background: var(--zen-primary);
  color: #ffffff;
  border: none;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
}

.draft-btn.resume-btn:hover {
  background: var(--zen-primary-hover);
  transform: translateY(-1px);
}

.draft-btn.discard-btn {
  background: transparent;
  color: var(--zen-text-secondary);
  border: 1px solid var(--zen-border);
}

.draft-btn.discard-btn:hover {
  background: var(--zen-surface-hover);
  color: var(--zen-text-primary);
}

.draft-btn-icon {
  width: 14px;
  height: 14px;
}

/* 底部 Dock 自动存盘指示器 */
.dock-autosave-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--zen-success);
  background: var(--zen-success-subtle);
  padding: 4px 10px;
  border-radius: var(--zen-radius-full);
  user-select: none;
}

.autosave-icon {
  width: 12px;
  height: 12px;
}

@media (max-width: 640px) {
  .survey-main-viewport {
    padding: 36px 16px 90px 16px;
  }
  .dock-btn-label {
    display: none;
  }
  .dock-nav-btn {
    padding: 8px 12px;
  }
  .draft-action-row {
    padding-left: 0;
  }
}
</style>
