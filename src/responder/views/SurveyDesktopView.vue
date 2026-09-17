<script setup lang="ts">
/**
 * src/responder/views/SurveyDesktopView.vue
 *
 * Desktop presentation view for questionnaire respondent application.
 * Retains widescreen Zen Paper card style, top header bar, and bottom floating dock.
 */

import { NButton, NSpin } from 'naive-ui';
import { History, ArrowRight } from 'lucide-vue-next';

import type { SurveyFlowContext } from '../../composables/useSurveyFlow';
import WelcomeCard from '../components/WelcomeCard.vue';
import QuestionStage from '../components/QuestionStage.vue';
import CompletionCard from '../components/CompletionCard.vue';
import DisqualifiedCard from '../components/DisqualifiedCard.vue';
import SurveyHeader from '../components/SurveyHeader.vue';
import SurveyDock from '../components/SurveyDock.vue';

defineProps<{
  flow: SurveyFlowContext;
}>();
</script>

<template>
  <div class="survey-desktop-container">
    <!-- Top header bar & progress bar -->
    <SurveyHeader
      :stage="flow.stage"
      :progress-percentage="flow.progressPercentage"
      :survey="flow.survey"
      :current-user="flow.currentUser"
      @open-ai-fill="flow.handleOpenAiFill"
      @open-auth="flow.showAuthModal = true"
      @logout="flow.handleUserLogout"
    />

    <!-- Loading state -->
    <div v-if="flow.loading" class="state-center-box">
      <NSpin size="large" />
      <p class="loading-hint">正在准备专属问卷体验...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="flow.error" class="state-center-box">
      <div class="error-card">
        <div class="error-badge">✕</div>
        <h3 class="error-title">无法开始问卷</h3>
        <p class="error-desc">{{ flow.error }}</p>
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
      <div v-if="flow.stage === 'welcome' && flow.survey" class="welcome-container">
        <!-- Historical draft recovery card -->
        <div v-if="flow.existingDraft" class="draft-resume-card">
          <div class="draft-card-header">
            <div class="draft-icon-bubble">
              <History class="draft-header-icon" />
            </div>
            <div class="draft-info-block">
              <div class="draft-title-row">
                <span class="draft-title">检测到上次未完成的作答草稿</span>
                <span class="draft-pill">
                  已作答 {{ flow.existingDraft.answeredCount }} / {{ flow.totalQuestions }} 题
                </span>
              </div>
              <div class="draft-desc">
                草稿已安全暂存在本设备，点击即可恢复作答现场，继续未完的题目。
              </div>
            </div>
          </div>

          <div class="draft-action-row">
            <button class="draft-btn resume-btn" @click="flow.handleResumeDraft">
              <span>恢复草稿并继续</span>
              <ArrowRight class="draft-btn-icon" />
            </button>
            <button class="draft-btn discard-btn" @click="flow.handleDiscardDraft">
              <span>放弃草稿从头开始</span>
            </button>
          </div>
        </div>

        <WelcomeCard
          :title="flow.survey.title"
          :description="flow.survey.description"
          :estimated-minutes="Math.max(2, Math.ceil(flow.totalQuestions / 2))"
          :total-questions="flow.totalQuestions"
          @start="flow.handleStart"
          @ai-fill="flow.handleOpenAiFill"
        />
      </div>

      <!-- Stage 2: Question interaction stage -->
      <div v-else-if="flow.stage === 'question' && flow.currentQuestion" class="stage-stage-wrap">
        <QuestionStage
          :ref="(el: any) => { (flow as any).questionStageRef = el }"
          :question="flow.currentQuestion"
          :seq-number="flow.currentSeqNumber"
          :total-questions="flow.totalQuestions"
          :current-answer="flow.currentAnswer"
          :is-ai-prefilled="flow.currentQuestion ? flow.aiRecordedQuestionIds.has(flow.currentQuestion.id) : false"
          @update:answer="flow.handleUpdateAnswer"
          @next="flow.handleNext"
        />
      </div>

      <!-- Stage 3: Completion screen -->
      <CompletionCard
        v-else-if="flow.stage === 'completed' && flow.survey"
        :survey-title="flow.survey.title"
        :response-id="flow.responseId"
        @restart="flow.handleRestart"
      />

      <!-- Stage 4: Disqualification screen -->
      <DisqualifiedCard
        v-else-if="flow.stage === 'disqualified'"
        :reason="flow.disqualifiedReason"
        @restart="flow.handleRestart"
      />
    </main>

    <!-- Floating navigation dock (visible during question stage) -->
    <SurveyDock
      v-if="flow.stage === 'question'"
      :history-length="flow.historyStack.length"
      :current-seq-number="flow.currentSeqNumber"
      :total-questions="flow.totalQuestions"
      :answered-count="flow.answeredCount"
      :is-submitting="flow.isSubmitting"
      :is-last-question="flow.isLastQuestion"
      @prev="flow.handlePrev"
      @next="flow.handleNext"
    />
  </div>
</template>

<style scoped>
.survey-desktop-container {
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
