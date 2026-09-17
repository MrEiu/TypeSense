<script setup lang="ts">
/**
 * src/responder/views/SurveyMobileView.vue
 *
 * Dedicated mobile & Android presentation view for questionnaire respondents.
 * Features full-bleed viewport, horizontal swipe navigation, bottom thumb-zone dock,
 * haptic vibration feedback, and iOS/Android safe-area padding.
 */

import { ref } from 'vue';
import { useSwipe, useVibrate } from '@vueuse/core';
import { NButton, NSpin } from 'naive-ui';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  History,
  ArrowRight,
  RotateCcw,
} from 'lucide-vue-next';

import type { SurveyFlowContext } from '../../composables/useSurveyFlow';
import WelcomeCard from '../components/WelcomeCard.vue';
import QuestionStage from '../components/QuestionStage.vue';
import CompletionCard from '../components/CompletionCard.vue';
import DisqualifiedCard from '../components/DisqualifiedCard.vue';

const props = defineProps<{
  flow: SurveyFlowContext;
}>();

// Haptic feedback via @vueuse/core
const { vibrate } = useVibrate({ pattern: [10] });

function triggerHaptic(duration = 10) {
  vibrate(duration);
}

function handleMobileNext() {
  triggerHaptic(12);
  props.flow.handleNext();
}

function handleMobilePrev() {
  if (props.flow.historyStack.length === 0) return;
  triggerHaptic(10);
  props.flow.handlePrev();
}

function handleAnswerUpdate(val: unknown) {
  triggerHaptic(8);
  props.flow.handleUpdateAnswer(val);
}

// Touch swipe gestures handling via @vueuse/core
const swipeTarget = ref<HTMLElement | null>(null);

useSwipe(swipeTarget, {
  passive: true,
  threshold: 50,
  onSwipeEnd(_e, direction) {
    if (direction === 'left') {
      handleMobileNext();
    } else if (direction === 'right') {
      handleMobilePrev();
    }
  },
});
</script>

<template>
  <div class="survey-mobile-container">
    <!-- Top pinned micro-progress bar -->
    <div class="mobile-progress-track">
      <div
        class="mobile-progress-bar"
        :style="{ width: `${flow.progressPercentage}%` }"
      />
    </div>

    <!-- Mobile App Header Bar -->
    <header class="mobile-top-header">
      <div class="header-left">
        <span class="mobile-app-title">{{ flow.survey?.title || '问卷作答' }}</span>
      </div>

      <div class="header-right">
        <!-- AI Quick-Fill trigger button -->
        <button
          v-if="flow.stage === 'question' || flow.stage === 'welcome'"
          class="mobile-ai-chip"
          title="开启 AI 智能对话填写"
          @click="flow.handleOpenAiFill"
        >
          <Sparkles class="mobile-ai-icon" />
          <span>AI 助填</span>
        </button>

        <!-- User profile or login button -->
        <button
          v-if="!flow.currentUser || !flow.currentUser.username"
          class="mobile-login-btn"
          @click="flow.showAuthModal = true"
        >
          登录
        </button>
        <button
          v-else
          class="mobile-user-avatar"
          title="退出登录"
          @click="flow.handleUserLogout"
        >
          {{ (flow.currentUser.username || 'U').charAt(0).toUpperCase() }}
        </button>
      </div>
    </header>

    <!-- Loading state -->
    <div v-if="flow.loading" class="mobile-state-box">
      <NSpin size="medium" />
      <p class="mobile-hint">正在加载问卷...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="flow.error" class="mobile-state-box">
      <div class="mobile-error-card">
        <div class="mobile-error-badge">✕</div>
        <h3 class="mobile-error-title">无法开始问卷</h3>
        <p class="mobile-error-desc">{{ flow.error }}</p>
        <NButton
          type="primary"
          block
          size="medium"
          @click="() => (window.location.href = '/')"
        >
          返回管理台
        </NButton>
      </div>
    </div>

    <!-- Mobile Questionnaire Main Viewport -->
    <main
      v-else
      ref="swipeTarget"
      class="mobile-main-content"
    >
      <!-- Stage 1: Welcome Screen -->
      <div v-if="flow.stage === 'welcome' && flow.survey" class="mobile-welcome-wrap">
        <!-- Draft recovery card -->
        <div v-if="flow.existingDraft" class="mobile-draft-card">
          <div class="draft-top-row">
            <div class="draft-icon-bubble">
              <History class="draft-icon" />
            </div>
            <div class="draft-text-col">
              <div class="draft-label">检测到未完成作答</div>
              <div class="draft-sub">
                已答 {{ flow.existingDraft.answeredCount }} / {{ flow.totalQuestions }} 题
              </div>
            </div>
          </div>
          <div class="draft-btn-group">
            <button class="mobile-draft-action-btn primary-action" @click="flow.handleResumeDraft">
              <span>恢复作答现场</span>
              <ArrowRight class="btn-arrow" />
            </button>
            <button class="mobile-draft-action-btn secondary-action" @click="flow.handleDiscardDraft">
              <span>重新开始</span>
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

      <!-- Stage 2: Question Interaction Stage -->
      <div v-else-if="flow.stage === 'question' && flow.currentQuestion" class="mobile-question-stage">
        <!-- Swipe gesture prompt badge -->
        <div class="gesture-hint-bar">
          <span class="gesture-dot"></span>
          <span>支持左右轻扫切题</span>
        </div>

        <QuestionStage
          ref="flow.questionStageRef"
          :question="flow.currentQuestion"
          :seq-number="flow.currentSeqNumber"
          :total-questions="flow.totalQuestions"
          :current-answer="flow.currentAnswer"
          :is-ai-prefilled="flow.currentQuestion ? flow.aiRecordedQuestionIds.has(flow.currentQuestion.id) : false"
          @update:answer="handleAnswerUpdate"
          @next="handleMobileNext"
        />
      </div>

      <!-- Stage 3: Completion Screen -->
      <div v-else-if="flow.stage === 'completed' && flow.survey" class="mobile-result-stage">
        <CompletionCard
          :survey-title="flow.survey.title"
          :response-id="flow.responseId"
          @restart="flow.handleRestart"
        />
      </div>

      <!-- Stage 4: Disqualification Screen -->
      <div v-else-if="flow.stage === 'disqualified'" class="mobile-result-stage">
        <DisqualifiedCard
          :reason="flow.disqualifiedReason"
          @restart="flow.handleRestart"
        />
      </div>
    </main>

    <!-- Mobile Thumb-Zone Bottom Dock Bar (Question Stage Only) -->
    <nav v-if="flow.stage === 'question'" class="mobile-bottom-dock">
      <div class="dock-container">
        <!-- Prev Button -->
        <button
          class="mobile-nav-btn prev-btn"
          :disabled="flow.historyStack.length === 0"
          @click="handleMobilePrev"
        >
          <ChevronLeft class="btn-icon" />
          <span class="btn-text">上一题</span>
        </button>

        <!-- Progress Counter -->
        <div class="mobile-progress-badge">
          <span class="curr-num">{{ flow.currentSeqNumber }}</span>
          <span class="divider">/</span>
          <span class="total-num">{{ flow.totalQuestions }}</span>
        </div>

        <!-- Next / Submit Button -->
        <button
          class="mobile-nav-btn next-primary-btn"
          :disabled="flow.isSubmitting"
          @click="handleMobileNext"
        >
          <span class="btn-text">{{ flow.isLastQuestion ? '完成提交' : '下一题' }}</span>
          <component :is="flow.isLastQuestion ? Check : ChevronRight" class="btn-icon" />
        </button>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.survey-mobile-container {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  position: relative;
  overflow-x: hidden;
  padding-top: env(safe-area-inset-top, 0px);
}

/* Top Progress Tracker */
.mobile-progress-track {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(15, 23, 42, 0.06);
  z-index: 120;
}

.mobile-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4f46e5 0%, #10b981 100%);
  transition: width 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Mobile Header */
.mobile-top-header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  z-index: 110;
}

.header-left {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.mobile-app-title {
  display: block;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.mobile-ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(147, 51, 234, 0.12) 100%);
  border: 1px solid rgba(147, 51, 234, 0.25);
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.mobile-ai-chip:active {
  transform: scale(0.95);
}

.mobile-ai-icon {
  width: 13px;
  height: 13px;
  color: #7c3aed;
}

.mobile-login-btn {
  background: none;
  border: none;
  color: #4f46e5;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
}

.mobile-user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #4f46e5;
  color: #ffffff;
  border: none;
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* States */
.mobile-state-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.mobile-hint {
  margin-top: 14px;
  font-size: 0.88rem;
  color: #64748b;
}

.mobile-error-card {
  width: 100%;
  max-width: 340px;
  background: #ffffff;
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 16px;
  padding: 24px 20px;
  text-align: center;
}

.mobile-error-badge {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #fee2e2;
  color: #ef4444;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  margin-bottom: 12px;
}

.mobile-error-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px 0;
}

.mobile-error-desc {
  font-size: 0.88rem;
  color: #64748b;
  margin: 0 0 20px 0;
  line-height: 1.5;
}

/* Main Viewport */
.mobile-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 14px calc(76px + env(safe-area-inset-bottom, 16px)) 14px;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.mobile-welcome-wrap,
.mobile-question-stage,
.mobile-result-stage {
  width: 100%;
}

/* Gesture hint */
.gesture-hint-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 0.74rem;
  color: #94a3b8;
  font-weight: 500;
}

.gesture-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #cbd5e1;
}

/* Mobile Draft Card */
.mobile-draft-card {
  background: #ffffff;
  border: 1.5px solid rgba(79, 70, 229, 0.25);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.06);
}

.draft-top-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.draft-icon-bubble {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(79, 70, 229, 0.1);
  color: #4f46e5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.draft-icon {
  width: 16px;
  height: 16px;
}

.draft-text-col {
  flex: 1;
}

.draft-label {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
}

.draft-sub {
  font-size: 0.78rem;
  color: #64748b;
  margin-top: 2px;
}

.draft-btn-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-draft-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease;
}

.mobile-draft-action-btn:active {
  transform: scale(0.98);
}

.primary-action {
  background: #4f46e5;
  color: #ffffff;
}

.secondary-action {
  background: #f1f5f9;
  color: #64748b;
}

.btn-arrow {
  width: 14px;
  height: 14px;
}

/* Deep component overrides for mobile */
:deep(.question-stage-box) {
  max-width: 100% !important;
  margin: 0 !important;
  padding: 20px 16px !important;
  border-radius: 16px !important;
  border: 1px solid rgba(15, 23, 42, 0.08) !important;
  box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.05) !important;
}

:deep(.question-title) {
  font-size: 1.18rem !important;
  line-height: 1.4 !important;
}

:deep(.action-footer) {
  display: none !important;
}

:deep(.option-item-card) {
  min-height: 48px !important;
  padding: 12px 14px !important;
  border-radius: 12px !important;
  transition: transform 0.1s ease !important;
}

:deep(.option-item-card:active) {
  transform: scale(0.98) !important;
}

/* Mobile Fixed Bottom Dock */
.mobile-bottom-dock {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  padding: 8px 14px calc(8px + env(safe-area-inset-bottom, 12px)) 14px;
  z-index: 100;
  box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.05);
}

.dock-container {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mobile-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border-radius: 12px;
  font-size: 0.92rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.15s ease;
  user-select: none;
}

.mobile-nav-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.mobile-nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.prev-btn {
  padding: 0 14px;
  background: #f1f5f9;
  color: #475569;
}

.mobile-progress-badge {
  display: flex;
  align-items: baseline;
  gap: 3px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #334155;
  padding: 4px 8px;
}

.curr-num {
  font-size: 1.05rem;
  color: #4f46e5;
}

.divider {
  color: #94a3b8;
  font-size: 0.8rem;
}

.total-num {
  color: #64748b;
}

.next-primary-btn {
  flex: 1;
  padding: 0 18px;
  background: #4f46e5;
  color: #ffffff;
  box-shadow: 0 3px 10px rgba(79, 70, 229, 0.28);
}

.btn-icon {
  width: 18px;
  height: 18px;
}
</style>
