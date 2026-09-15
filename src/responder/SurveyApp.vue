<script setup lang="ts">
/**
 * src/responder/SurveyApp.vue
 *
 * Questionnaire Respondent Application entry.
 * Coordinates stage navigation, flow engine state, bottom floating dock, and AI chat filler.
 */

import {
  NConfigProvider,
  NMessageProvider,
  NButton,
  NSpin,
  type GlobalThemeOverrides,
} from 'naive-ui';
import { History, ArrowRight } from 'lucide-vue-next';

import { useSurveyFlow } from '../composables/useSurveyFlow';
import type { QuestionAnswerMap } from '../schema/questionnaire-schema-types';

import WelcomeCard from './components/WelcomeCard.vue';
import QuestionStage from './components/QuestionStage.vue';
import CompletionCard from './components/CompletionCard.vue';
import DisqualifiedCard from './components/DisqualifiedCard.vue';
import AuthModal from '../components/auth/AuthModal.vue';
import AiSurveyChatFillerModal from './components/AiSurveyChatFillerModal.vue';
import SurveyHeader from './components/SurveyHeader.vue';
import SurveyDock from './components/SurveyDock.vue';

// Naive UI Zen Paper theme tokens
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

// Respondent flow state composable
const {
  currentUser,
  showAuthModal,
  showAiChatFiller,
  loading,
  error,
  survey,
  stage,
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
  totalQuestions,
  answeredCount,
  currentSeqNumber,
  progressPercentage,
  isLastQuestion,
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
} = useSurveyFlow();
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="survey-screen-container">
        <!-- Top header bar & progress bar -->
        <SurveyHeader
          :stage="stage"
          :progress-percentage="progressPercentage"
          :survey="survey"
          :current-user="currentUser"
          @open-ai-fill="handleOpenAiFill"
          @open-auth="showAuthModal = true"
          @logout="handleUserLogout"
        />

        <!-- Loading state -->
        <div v-if="loading" class="state-center-box">
          <NSpin size="large" />
          <p class="loading-hint">正在准备专属问卷体验...</p>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="state-center-box">
          <div class="error-card">
            <div class="error-badge">✕</div>
            <h3 class="error-title">无法开始问卷</h3>
            <p class="error-desc">{{ error }}</p>
            <div class="error-action">
              <NButton type="primary" secondary @click="() => (window.location.href = '/')">
                返回问卷管理台
              </NButton>
            </div>
          </div>
        </div>

        <!-- Main questionnaire viewport -->
        <main v-else class="survey-main-viewport">
          <!-- Stage 1: Welcome screen -->
          <div v-if="stage === 'welcome' && survey" class="welcome-container">
            <!-- Historical draft recovery card -->
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

          <!-- Stage 2: Question interaction stage -->
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

          <!-- Stage 3: Completion screen -->
          <CompletionCard
            v-else-if="stage === 'completed' && survey"
            :survey-title="survey.title"
            :response-id="responseId"
            @restart="handleRestart"
          />

          <!-- Stage 4: Disqualification screen -->
          <DisqualifiedCard
            v-else-if="stage === 'disqualified'"
            :reason="disqualifiedReason"
            @restart="handleRestart"
          />
        </main>

        <!-- Floating navigation dock (visible during question stage) -->
        <SurveyDock
          v-if="stage === 'question'"
          :history-length="historyStack.length"
          :current-seq-number="currentSeqNumber"
          :total-questions="totalQuestions"
          :answered-count="answeredCount"
          :is-submitting="isSubmitting"
          :is-last-question="isLastQuestion"
          @prev="handlePrev"
          @next="handleNext"
        />

        <!-- Respondent Authentication Modal -->
        <AuthModal
          v-model:show="showAuthModal"
          mode="user"
          :closable="true"
          @success="onAuthSuccess"
        />

        <!-- AI Chat Quick-Filler Modal -->
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
  background-color: var(--zen-bg, #fafafa);
  position: relative;
  overflow-x: hidden;
}

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
  color: var(--zen-text-secondary, #64748b);
  font-weight: 500;
}

.error-card {
  max-width: 480px;
  width: 100%;
  background: var(--zen-surface, #ffffff);
  border: 1px solid var(--zen-border, rgba(15, 23, 42, 0.08));
  border-radius: var(--zen-radius-lg, 16px);
  padding: 36px 28px;
  text-align: center;
  box-shadow: var(--zen-shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.05));
}

.error-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--zen-danger-subtle, #fee2e2);
  color: var(--zen-danger, #ef4444);
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
  color: var(--zen-text-primary, #0f172a);
  margin: 0 0 10px 0;
}

.error-desc {
  font-size: 0.92rem;
  color: var(--zen-text-secondary, #64748b);
  line-height: 1.6;
  margin: 0 0 24px 0;
}

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

.welcome-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.draft-resume-card {
  background: #ffffff;
  border: 1.5px solid rgba(79, 70, 229, 0.25);
  border-radius: var(--zen-radius-md, 12px);
  padding: 20px 24px;
  box-shadow: 0 4px 16px -2px rgba(79, 70, 229, 0.08);
  animation: slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-12px);
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
  background: rgba(79, 70, 229, 0.1);
  color: #4f46e5;
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
  flex: 1;
}

.draft-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.draft-title {
  font-weight: 700;
  font-size: 1rem;
  color: #0f172a;
}

.draft-pill {
  font-size: 0.78rem;
  font-weight: 600;
  color: #4f46e5;
  background: rgba(79, 70, 229, 0.08);
  padding: 3px 8px;
  border-radius: 9999px;
}

.draft-desc {
  font-size: 0.88rem;
  color: #64748b;
  line-height: 1.5;
}

.draft-action-row {
  display: flex;
  gap: 12px;
}

.draft-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.resume-btn {
  background: #4f46e5;
  color: #ffffff;
}

.resume-btn:hover {
  background: #4338ca;
}

.draft-btn-icon {
  width: 14px;
  height: 14px;
}

.discard-btn {
  background: #f1f5f9;
  color: #64748b;
}

.discard-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}
</style>
