<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { NButton } from 'naive-ui';
import { Check, Sparkles } from 'lucide-vue-next';
import { animate, spring, stagger } from 'motion';
import type { QuestionItemModel } from '../../schema/questionnaire-schema-types';
import { questionRegistry } from '../../questions/registry';

const props = defineProps<{
  question: QuestionItemModel;
  seqNumber: number;
  totalQuestions: number;
  currentAnswer?: unknown;
  isAiPrefilled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:answer', val: unknown): void;
  (e: 'next'): void;
}>();

const cardRef = ref<HTMLElement | null>(null);
const optionsContainerRef = ref<HTMLElement | null>(null);

const currentPlugin = computed(() => questionRegistry.get(props.question.type));
const isRequired = computed(() => props.question.required !== false);

function handlePluginCommit() {
  // Allow 220ms eye fixation and physical feedback before automatic step advance
  setTimeout(() => {
    emit('next');
  }, 220);
}

// 必填未通过时的物理阻尼抖动反馈
function triggerShake() {
  if (cardRef.value) {
    animate(
      cardRef.value,
      { x: [0, -10, 10, -7, 7, -3, 3, 0] },
      { duration: 0.38, easing: 'ease-out' }
    );
  }
}

defineExpose({
  triggerShake,
});

// 运行 Motion 的 Stagger 瀑布交错轻弹动效
function runStaggerAnimation() {
  nextTick(() => {
    if (!optionsContainerRef.value) return;
    const items = optionsContainerRef.value.querySelectorAll('.option-item-card, .scale-btn');
    if (items.length > 0) {
      animate(
        items,
        { opacity: [0, 1], y: [16, 0] },
        {
          delay: stagger(0.04),
          easing: spring({ stiffness: 350, damping: 24 }),
        }
      );
    }
  });
}

onMounted(() => {
  runStaggerAnimation();
});

watch(
  () => props.question.id,
  () => {
    runStaggerAnimation();
  }
);
</script>

<template>
  <div ref="cardRef" class="question-stage-box">
    <!-- 题干头部 -->
    <div class="headline-group">
      <div class="prompt-header-line">
        <div class="seq-badge">
          <span>{{ seqNumber }}</span>
        </div>

        <h2 class="question-title">
          {{ question.title }}
          <span v-if="isRequired" class="required-star">*</span>
          <span v-else class="optional-badge">(选填)</span>
        </h2>
      </div>

      <p v-if="question.description" class="sub-prompt">
        {{ question.description }}
      </p>

      <!-- AI 预填轻量提示条 -->
      <div v-if="isAiPrefilled" class="ai-prefilled-chip">
        <Sparkles :size="13" class="ai-chip-icon" />
        <span>AI 已预填本题，可直接核对确认或修改</span>
      </div>
    </div>

    <!-- 交互主体：完全由题目插件系统动态驱动 -->
    <div ref="optionsContainerRef" class="interactive-body">
      <component
        :is="currentPlugin.component"
        v-if="currentPlugin"
        :model="question"
        :value="currentAnswer"
        @update:value="emit('update:answer', $event)"
        @commit="handlePluginCommit"
      />
      <div v-else class="unsupported-type-alert">
        Unsupported question type: {{ question.type }}
      </div>
    </div>

    <!-- 底部确认操作栏 (单选题点击自动推进流转，不显示确认键；非单选题显示确认键) -->
    <div v-if="question.type !== 'single_choice'" class="action-footer">
      <NButton
        type="primary"
        size="large"
        class="zen-ok-btn"
        @click="emit('next')"
      >
        <span>确认</span>
        <template #icon>
          <Check :size="17" stroke-width="2.5" />
        </template>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.question-stage-box {
  max-width: 680px;
  margin: 0 auto;
  padding: 44px 38px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.06);
}

.headline-group {
  margin-bottom: 28px;
}

.prompt-header-line {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.seq-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  background: #ecfdf5;
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #059669;
  margin-top: 3px;
  flex-shrink: 0;
}

.question-title {
  font-size: 1.45rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.45;
  margin: 0;
  letter-spacing: -0.01em;
}

.required-star {
  color: #ef4444;
  margin-left: 4px;
}

.optional-badge {
  font-size: 0.85rem;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 8px;
}

.sub-prompt {
  font-size: 0.98rem;
  color: #64748b;
  line-height: 1.6;
  margin: 10px 0 0 46px;
}

.ai-prefilled-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin: 10px 0 0 46px;
  background: rgba(79, 70, 229, 0.08);
  border: 1px solid rgba(79, 70, 229, 0.2);
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #4f46e5;
}

.ai-chip-icon {
  flex-shrink: 0;
  color: #4f46e5;
}

.interactive-body {
  margin-bottom: 32px;
}

.unsupported-type-alert {
  padding: 16px 20px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  color: #b91c1c;
  font-size: 0.92rem;
}

/* 选项列表与卡片 */
:deep(.options-stack) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:deep(.option-item-card) {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 22px;
  background: #ffffff;
  border: 1.5px solid rgba(15, 23, 42, 0.09);
  border-radius: 14px;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transform: translateY(0);
  transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.16s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.16s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

:deep(.option-item-card:hover:not(.is-disabled)) {
  transform: translateY(-2px);
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 8px 20px -4px rgba(79, 70, 229, 0.08);
}

:deep(.option-item-card:active:not(.is-disabled)) {
  transform: scale(0.975);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

:deep(.option-item-card.is-selected) {
  background: #f5f3ff;
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1, 0 8px 20px -4px rgba(99, 102, 241, 0.12);
}

:deep(.key-badge) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: #f1f5f9;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
  flex-shrink: 0;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

:deep(.option-item-card.is-selected .key-badge) {
  background: #6366f1;
  color: #ffffff;
}

:deep(.option-label) {
  font-size: 1.02rem;
  font-weight: 500;
  color: #1e293b;
  flex: 1;
}

/* 李克特打分 / 矩阵量表 (Compact & Ergonomic) */
:deep(.likert-container) {
  overflow-x: auto;
  padding-bottom: 4px;
}

:deep(.scale-row) {
  display: flex;
  gap: 8px;
  align-items: stretch;
  justify-content: space-between;
}

:deep(.scale-btn) {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 10px 6px;
  background: #ffffff;
  border: 1.5px solid rgba(15, 23, 42, 0.09);
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

:deep(.scale-btn:hover) {
  transform: translateY(-1px);
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 4px 12px -2px rgba(79, 70, 229, 0.08);
}

:deep(.scale-btn:active) {
  transform: scale(0.96);
}

:deep(.scale-btn.is-active) {
  background: #ecfdf5;
  border-color: #10b981;
  box-shadow: 0 0 0 1px #10b981;
}

:deep(.scale-num) {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

:deep(.scale-btn.is-active .scale-num) {
  color: #059669;
}

:deep(.scale-text) {
  font-size: 0.74rem;
  color: #64748b;
  text-align: center;
  line-height: 1.25;
}

/* 矩阵李克特量表样式 (Matrix) - 紧凑现代排版 */
:deep(.likert-matrix-wrap) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:deep(.likert-matrix-header-desktop) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 4px;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 600;
}

:deep(.header-statement-col) {
  flex: 1;
}

:deep(.header-scale-cols) {
  display: flex;
  gap: 6px;
}

:deep(.header-scale-item) {
  width: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

:deep(.header-scale-num) {
  font-weight: 700;
  font-size: 0.84rem;
  color: #0f172a;
}

:deep(.header-scale-label) {
  font-size: 0.7rem;
  color: #94a3b8;
  white-space: nowrap;
}

:deep(.likert-matrix-rows) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:deep(.likert-matrix-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  transition: all 0.15s ease;
}

:deep(.likert-matrix-row:hover) {
  background: #ffffff;
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.05);
}

:deep(.likert-matrix-row.is-answered) {
  background: #ffffff;
  border-color: rgba(16, 185, 129, 0.35);
}

:deep(.matrix-row-statement) {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

:deep(.stmt-index-tag) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: #ecfdf5;
  color: #059669;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
}

:deep(.stmt-title-text) {
  font-size: 0.88rem;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.35;
}

:deep(.matrix-row-scales) {
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(.matrix-scale-btn) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 48px;
  padding: 5px 6px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

:deep(.matrix-scale-btn .scale-num) {
  font-size: 0.86rem;
  font-weight: 700;
  color: #334155;
}

:deep(.matrix-scale-btn .scale-label) {
  font-size: 0.65rem;
  color: #64748b;
  white-space: nowrap;
}

:deep(.matrix-scale-btn:hover:not(:disabled)) {
  transform: translateY(-1px);
  border-color: #10b981;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.12);
}

:deep(.matrix-scale-btn.is-selected) {
  background: #ecfdf5;
  border-color: #10b981;
  box-shadow: 0 0 0 1px #10b981;
}

:deep(.matrix-scale-btn.is-selected .scale-num) {
  color: #059669;
}

:deep(.matrix-scale-btn.is-selected .scale-label) {
  color: #047857;
  font-weight: 600;
}

@media (max-width: 640px) {
  :deep(.likert-matrix-header-desktop) {
    display: none;
  }
  :deep(.likert-matrix-row) {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 9px;
  }
  :deep(.matrix-row-scales) {
    gap: 4px;
    justify-content: space-between;
  }
  :deep(.matrix-scale-btn) {
    flex: 1;
    min-width: 0;
    padding: 5px 2px;
    border-radius: 6px;
  }
  :deep(.matrix-scale-btn .scale-num) {
    font-size: 0.8rem;
  }
  :deep(.matrix-scale-btn .scale-label) {
    font-size: 0.58rem;
  }
}

/* 文本域 */
:deep(.text-input-wrap .n-input) {
  border-radius: 14px;
  background: #f8fafc;
  font-size: 1rem;
}

.action-footer {
  display: flex;
  align-items: center;
  gap: 14px;
}

:deep(.zen-ok-btn) {
  height: 44px;
  padding: 0 24px;
  border-radius: 10px;
  font-size: 0.98rem;
  font-weight: 600;
  background-color: #4f46e5 !important;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.16s ease;
}

:deep(.zen-ok-btn:hover) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
}

:deep(.zen-ok-btn:active) {
  transform: scale(0.97);
}
</style>

