<script setup lang="ts">
/**
 * src/responder/views/SurveyMobileView.vue
 *
 * Dedicated mobile & Android presentation view for questionnaire respondents.
 * Features compact adaptive sizing, horizontal swipe navigation, top header counter,
 * haptic vibration feedback, and safe-area padding (without bottom dock buttons).
 */

import { ref } from 'vue';
import { useSwipe, useVibrate } from '@vueuse/core';
import { NButton, NSpin } from 'naive-ui';
import {
  ChevronLeft,
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
  threshold: 45,
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
        <!-- Back button if question stage and previous questions exist -->
        <button
          v-if="flow.stage === 'question' && flow.historyStack.length > 0"
          class="mobile-header-back-btn"
          title="返回上一题"
          @click="handleMobilePrev"
        >
          <ChevronLeft class="back-icon" />
        </button>
        <span class="mobile-app-title">{{ flow.survey?.title || '问卷作答' }}</span>
      </div>

      <!-- Center question step indicator (Only in question stage) -->
      <div v-if="flow.stage === 'question'" class="header-step-pill">
        <span class="step-curr">{{ flow.currentSeqNumber }}</span>
        <span class="step-slash">/</span>
        <span class="step-total">{{ flow.totalQuestions }}</span>
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
        <!-- Compact swipe gesture hint bar -->
        <div class="gesture-hint-bar">
          <span class="gesture-dot"></span>
          <span>左右滑动切题</span>
        </div>

        <QuestionStage
          :ref="(el: any) => { (flow as any).questionStageRef = el }"
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
  height: 2.5px;
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
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
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
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
}

.mobile-header-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: #f1f5f9;
  color: #475569;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.12s ease;
}

.mobile-header-back-btn:active {
  transform: scale(0.92);
}

.back-icon {
  width: 16px;
  height: 16px;
}

.mobile-app-title {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Center step indicator pill */
.header-step-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  padding: 2px 8px;
  background: #f1f5f9;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 700;
  color: #334155;
  margin-right: 8px;
  flex-shrink: 0;
}

.step-curr {
  color: #4f46e5;
  font-size: 0.82rem;
}

.step-slash {
  color: #94a3b8;
  font-size: 0.7rem;
}

.step-total {
  color: #64748b;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mobile-ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(147, 51, 234, 0.12) 100%);
  border: 1px solid rgba(147, 51, 234, 0.22);
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.mobile-ai-chip:active {
  transform: scale(0.95);
}

.mobile-ai-icon {
  width: 12px;
  height: 12px;
  color: #7c3aed;
}

.mobile-login-btn {
  background: none;
  border: none;
  color: #4f46e5;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 3px 6px;
}

.mobile-user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #4f46e5;
  color: #ffffff;
  border: none;
  font-size: 0.75rem;
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
  padding: 32px 16px;
}

.mobile-hint {
  margin-top: 12px;
  font-size: 0.84rem;
  color: #64748b;
}

.mobile-error-card {
  width: 100%;
  max-width: 320px;
  background: #ffffff;
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 14px;
  padding: 20px 16px;
  text-align: center;
}

.mobile-error-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fee2e2;
  color: #ef4444;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  margin-bottom: 10px;
}

.mobile-error-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.mobile-error-desc {
  font-size: 0.82rem;
  color: #64748b;
  margin: 0 0 16px 0;
  line-height: 1.45;
}

/* Main Viewport */
.mobile-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px 12px calc(24px + env(safe-area-inset-bottom, 12px)) 12px;
  max-width: 520px;
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
  gap: 5px;
  margin-bottom: 8px;
  font-size: 0.72rem;
  color: #94a3b8;
  font-weight: 500;
}

.gesture-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #cbd5e1;
}

/* Mobile Draft Card */
.mobile-draft-card {
  background: #ffffff;
  border: 1px solid rgba(79, 70, 229, 0.2);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.05);
}

.draft-top-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.draft-icon-bubble {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: rgba(79, 70, 229, 0.1);
  color: #4f46e5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.draft-icon {
  width: 15px;
  height: 15px;
}

.draft-text-col {
  flex: 1;
}

.draft-label {
  font-size: 0.86rem;
  font-weight: 700;
  color: #0f172a;
}

.draft-sub {
  font-size: 0.74rem;
  color: #64748b;
  margin-top: 1px;
}

.draft-btn-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mobile-draft-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.84rem;
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
  width: 13px;
  height: 13px;
}

/* =========================================================
   Mobile Adaptive Scaling Overrides (Compact & Proportionate)
   ========================================================= */

:deep(.question-stage-box) {
  max-width: 100% !important;
  margin: 0 !important;
  padding: 16px 14px !important;
  border-radius: 14px !important;
  border: 1px solid rgba(15, 23, 42, 0.08) !important;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.03) !important;
}

:deep(.headline-group) {
  margin-bottom: 14px !important;
}

:deep(.prompt-header-line) {
  gap: 8px !important;
  align-items: flex-start !important;
}

:deep(.seq-badge) {
  min-width: 22px !important;
  height: 22px !important;
  padding: 0 6px !important;
  font-size: 0.74rem !important;
  border-radius: 6px !important;
  margin-top: 1px !important;
}

:deep(.question-title) {
  font-size: clamp(0.98rem, 3.8vw, 1.12rem) !important;
  line-height: 1.35 !important;
  font-weight: 600 !important;
  color: #0f172a !important;
}

:deep(.optional-badge) {
  font-size: 0.78rem !important;
  margin-left: 6px !important;
}

:deep(.sub-prompt) {
  margin: 6px 0 0 0 !important;
  font-size: 0.82rem !important;
  line-height: 1.45 !important;
  color: #64748b !important;
}

:deep(.ai-prefilled-chip) {
  margin: 6px 0 0 0 !important;
  padding: 3px 8px !important;
  font-size: 0.72rem !important;
  border-radius: 6px !important;
}

:deep(.interactive-body) {
  margin-bottom: 14px !important;
}

:deep(.options-stack) {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
}

:deep(.option-item-card) {
  min-height: 40px !important;
  padding: 9px 12px !important;
  border-radius: 10px !important;
  gap: 10px !important;
  border-width: 1px !important;
  transition: transform 0.1s ease !important;
}

:deep(.option-item-card:active) {
  transform: scale(0.98) !important;
}

:deep(.key-badge) {
  width: 22px !important;
  height: 22px !important;
  font-size: 0.72rem !important;
  border-radius: 6px !important;
}

:deep(.option-label) {
  font-size: 0.86rem !important;
  line-height: 1.35 !important;
}

/* In-card Action Footer (Confirmation button for non-single-choice questions) */
:deep(.action-footer) {
  display: flex !important;
  align-items: center !important;
  justify-content: stretch !important;
  margin-top: 14px !important;
}

:deep(.zen-ok-btn) {
  width: 100% !important;
  height: 38px !important;
  padding: 0 16px !important;
  border-radius: 9px !important;
  font-size: 0.88rem !important;
  font-weight: 600 !important;
  background-color: #4f46e5 !important;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25) !important;
}

/* Likert Matrix Adaptive Sizing (Ultra-Compact) */
:deep(.likert-container) {
  padding-bottom: 2px !important;
}

:deep(.scale-row) {
  display: flex !important;
  gap: 5px !important;
  align-items: stretch !important;
}

:deep(.scale-btn) {
  flex: 1 !important;
  min-width: 0 !important;
  padding: 8px 3px !important;
  gap: 2px !important;
  border-radius: 7px !important;
}

:deep(.scale-btn .scale-num) {
  font-size: 0.88rem !important;
}

:deep(.scale-btn .scale-text) {
  font-size: 0.64rem !important;
}

:deep(.likert-matrix-wrap) {
  gap: 6px !important;
}

:deep(.likert-matrix-rows) {
  gap: 5px !important;
}

:deep(.likert-matrix-row) {
  gap: 5px !important;
  padding: 7px 9px !important;
  border-radius: 8px !important;
  margin-bottom: 0 !important;
  border-width: 1px !important;
}

:deep(.matrix-row-statement) {
  gap: 6px !important;
}

:deep(.stmt-index-tag) {
  width: 16px !important;
  height: 16px !important;
  font-size: 0.68rem !important;
  border-radius: 4px !important;
}

:deep(.stmt-title-text) {
  font-size: 0.82rem !important;
  line-height: 1.3 !important;
}

:deep(.matrix-row-scales) {
  gap: 3px !important;
  width: 100% !important;
}

:deep(.matrix-scale-btn) {
  flex: 1 !important;
  min-width: 0 !important;
  padding: 4px 1px !important;
  border-radius: 6px !important;
  gap: 1px !important;
  border-width: 1px !important;
}

:deep(.matrix-scale-btn .scale-num) {
  font-size: 0.78rem !important;
  font-weight: 700 !important;
}

:deep(.matrix-scale-btn .scale-label) {
  font-size: 0.58rem !important;
  letter-spacing: -0.02em !important;
}

/* Text Inputs */
:deep(.text-input-wrap .n-input) {
  border-radius: 10px !important;
  font-size: 0.88rem !important;
  background: #f8fafc !important;
}

/* Welcome Card Mobile Adaptive */
:deep(.welcome-card-box) {
  padding: 24px 16px !important;
  border-radius: 14px !important;
}

:deep(.welcome-title) {
  font-size: 1.25rem !important;
}

:deep(.welcome-desc) {
  font-size: 0.85rem !important;
}

:deep(.welcome-btn) {
  height: 40px !important;
  font-size: 0.9rem !important;
}
</style>
