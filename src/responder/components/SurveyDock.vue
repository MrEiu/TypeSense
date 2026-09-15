<script setup lang="ts">
/**
 * src/responder/components/SurveyDock.vue
 *
 * Floating bottom dock bar for respondent survey navigation.
 * Displays rollback button, step progress count, answered count, and advance/submit button.
 */

import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

defineProps<{
  historyLength: number;
  currentSeqNumber: number;
  totalQuestions: number;
  answeredCount: number;
  isSubmitting: boolean;
  isLastQuestion: boolean;
}>();

const emit = defineEmits<{
  (e: 'prev'): void;
  (e: 'next'): void;
}>();
</script>

<template>
  <nav class="floating-dock-bar">
    <div class="dock-inner">
      <!-- Previous question button -->
      <button
        class="dock-nav-btn prev-btn"
        :disabled="historyLength === 0"
        title="回退上一题"
        @click="emit('prev')"
      >
        <ChevronLeft class="dock-icon" />
        <span class="dock-btn-label">上一题</span>
      </button>

      <!-- Step & progress indicator -->
      <div class="dock-counter">
        <span class="counter-curr">{{ currentSeqNumber }}</span>
        <span class="counter-divider">/</span>
        <span class="counter-total">{{ totalQuestions }}</span>
        <span v-if="answeredCount > 0" class="counter-answered">· 已作答 {{ answeredCount }} 题</span>
      </div>

      <!-- Advance / submit button -->
      <button
        class="dock-nav-btn next-btn"
        :disabled="isSubmitting"
        :title="isLastQuestion ? '完成并提交问卷' : '进入下一题'"
        @click="emit('next')"
      >
        <span class="dock-btn-label">{{ isLastQuestion ? '完成提交' : '下一题' }}</span>
        <ChevronRight class="dock-icon" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
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
  border: 1px solid var(--zen-border, rgba(15, 23, 42, 0.08));
  box-shadow: var(--zen-shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.1));
  border-radius: var(--zen-radius-full, 9999px);
  padding: 6px 10px;
}

.dock-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--zen-radius-full, 9999px);
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--zen-transition-fast, 0.15s ease);
}

.dock-nav-btn.prev-btn {
  background: transparent;
  color: var(--zen-text-secondary, #64748b);
}

.dock-nav-btn.prev-btn:hover:not(:disabled) {
  background: var(--zen-surface-hover, #f1f5f9);
  color: var(--zen-text-primary, #0f172a);
}

.dock-nav-btn.prev-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.dock-nav-btn.next-btn {
  background: transparent;
  color: var(--zen-text-secondary, #64748b);
  box-shadow: none;
}

.dock-nav-btn.next-btn:hover:not(:disabled) {
  background: var(--zen-surface-hover, #f1f5f9);
  color: var(--zen-text-primary, #0f172a);
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
  color: var(--zen-text-muted, #94a3b8);
  user-select: none;
}

.counter-answered {
  margin-left: 6px;
  color: #4f46e5;
  font-weight: 600;
  font-size: 0.8rem;
}

.counter-curr {
  color: var(--zen-text-primary, #0f172a);
  font-weight: 700;
}

.counter-divider {
  margin: 0 4px;
}
</style>
