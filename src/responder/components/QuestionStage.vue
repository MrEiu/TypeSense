<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { NButton } from 'naive-ui';
import { Check } from 'lucide-vue-next';
import { animate, spring, stagger } from 'motion';
import type { QuestionItemModel } from '../../schema/questionnaire-schema-types';
import { questionRegistry } from '../../questions/registry';

const props = defineProps<{
  question: QuestionItemModel;
  seqNumber: number;
  totalQuestions: number;
  currentAnswer?: unknown;
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
          <span class="arrow-sym">➔</span>
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

    <!-- 底部确定与快捷键操作栏 -->
    <div class="action-footer">
      <NButton
        type="primary"
        size="large"
        class="zen-ok-btn"
        @click="emit('next')"
      >
        <span>确定</span>
        <template #icon>
          <Check :size="17" stroke-width="2.5" />
        </template>
      </NButton>

      <span class="enter-hint">
        按 <kbd class="kbd-badge">Enter ↵</kbd>
      </span>
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
  gap: 4px;
  padding: 4px 10px;
  background: #f1f5f9;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #4f46e5;
  margin-top: 3px;
  flex-shrink: 0;
}

.arrow-sym {
  color: #94a3b8;
  font-size: 0.8rem;
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
  font-size: 0.96rem;
  color: #64748b;
  line-height: 1.6;
  margin: 10px 0 0 46px;
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

/* 李克特打分 */
:deep(.likert-container) {
  overflow-x: auto;
  padding-bottom: 8px;
}

:deep(.scale-row) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 10px;
}

:deep(.scale-btn) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px 12px;
  background: #ffffff;
  border: 1.5px solid rgba(15, 23, 42, 0.09);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

:deep(.scale-btn:hover) {
  transform: translateY(-2px);
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 8px 18px -4px rgba(79, 70, 229, 0.08);
}

:deep(.scale-btn:active) {
  transform: scale(0.96);
}

:deep(.scale-btn.is-active) {
  background: #eef2ff;
  border-color: #4f46e5;
  box-shadow: 0 0 0 1px #4f46e5;
}

:deep(.scale-num) {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}

:deep(.scale-btn.is-active .scale-num) {
  color: #4338ca;
}

:deep(.scale-text) {
  font-size: 0.8rem;
  color: #64748b;
  text-align: center;
  line-height: 1.3;
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

.enter-hint {
  font-size: 0.88rem;
  color: #94a3b8;
}

.kbd-badge {
  display: inline-block;
  padding: 2px 7px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #475569;
  font-family: inherit;
  font-weight: 600;
}
</style>

