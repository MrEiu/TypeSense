<script setup lang="ts">
/**
 * src/console/components/studio/StudioPromptStep.vue
 *
 * Wizard Step 2: Survey Research Intent, Prompt Textarea, and Target Count Slider/Presets.
 */

import { NInput, NSlider, NButton } from 'naive-ui';
import { ArrowLeft, ArrowRight } from 'lucide-vue-next';

defineProps<{
  userPrompt: string;
  targetCount: number;
  questionCountPresets: number[];
}>();

const emit = defineEmits<{
  (e: 'update:userPrompt', val: string): void;
  (e: 'update:targetCount', val: number): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();
</script>

<template>
  <div class="step-content">
    <!-- Prompt input -->
    <div class="form-section">
      <label class="form-label">调研核心意图 / 提示词 (Prompt)</label>
      <NInput
        :value="userPrompt"
        type="textarea"
        :rows="3"
        placeholder="请输入调研主题、考察目的或特定题型要求（如：针对研发团队的 AI 工具交付效率与工程满意度调研）..."
        @update:value="(val) => emit('update:userPrompt', val)"
      />
    </div>

    <!-- Scale presets -->
    <div class="form-section">
      <label class="form-label">期望题目规模: <strong>{{ targetCount }}</strong> 题</label>
      <div class="count-presets-grid">
        <button
          v-for="count in questionCountPresets"
          :key="count"
          type="button"
          class="count-preset-card"
          :class="{ 'is-selected': targetCount === count }"
          @click="emit('update:targetCount', count)"
        >
          <div class="preset-count-num">{{ count }} 题</div>
        </button>
      </div>
      <div style="margin-top: 10px;">
        <NSlider
          :value="targetCount"
          :min="1"
          :max="80"
          :step="1"
          @update:value="(val) => emit('update:targetCount', val)"
        />
      </div>
    </div>

    <!-- Footer buttons -->
    <div class="card-footer-nav dual-btn">
      <NButton secondary size="medium" @click="emit('prev')">
        <template #icon><ArrowLeft :size="14" /></template>
        <span>上一步</span>
      </NButton>
      <NButton type="primary" size="medium" @click="emit('next')">
        <span>下一步：拓扑流转与模板</span>
        <template #icon><ArrowRight :size="14" /></template>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.step-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.count-presets-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.count-preset-card {
  padding: 8px 4px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s ease;
}

.count-preset-card:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.count-preset-card.is-selected {
  border-color: #6366f1;
  background: #eef2ff;
}

.preset-count-num {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}

.count-preset-card.is-selected .preset-count-num {
  color: #4f46e5;
}

.card-footer-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid rgba(15, 23, 42, 0.05);
}

.dual-btn {
  display: flex;
  justify-content: space-between;
}
</style>
