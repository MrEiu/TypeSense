<script setup lang="ts">
/**
 * src/console/components/editor/EditorPreviewPanel.vue
 *
 * Left panel for AI Survey Editor: Live questionnaire preview comparing working vs original.
 */

import { NSpin, NTag } from 'naive-ui';
import { ArrowRight } from 'lucide-vue-next';
import type { QuestionnaireModel } from '../../../schema/questionnaire-schema-types';

defineProps<{
  loading: boolean;
  activeViewVersion: 'working' | 'original';
  currentSurveyModel: QuestionnaireModel | null;
}>();
</script>

<template>
  <div class="survey-preview-panel">
    <div v-if="loading" class="loading-state">
      <NSpin size="large" description="正在载入问卷数据..." />
    </div>

    <div v-else-if="currentSurveyModel" class="survey-content-scroll">
      <div class="survey-meta-header">
        <div class="version-watermark">
          {{ activeViewVersion === 'working' ? '当前工作版本 (Working)' : '原始版本 (Original)' }}
        </div>
        <h2 class="survey-name">{{ currentSurveyModel.title }}</h2>
        <p v-if="currentSurveyModel.description" class="survey-desc">
          {{ currentSurveyModel.description }}
        </p>
      </div>

      <!-- Question cards list -->
      <div class="questions-list">
        <div
          v-for="(q, index) in currentSurveyModel.questions"
          :key="q.id || index"
          class="question-card"
        >
          <div class="q-header">
            <span class="q-index">第 {{ index + 1 }} 题 ({{ q.id }})</span>
            <NTag size="small" :bordered="false" type="info">{{ q.type }}</NTag>
            <NTag v-if="q.required" size="small" :bordered="false" type="error">必填</NTag>
          </div>
          <div class="q-title">{{ q.title }}</div>

          <!-- Options grid -->
          <div v-if="Array.isArray(q.options) && q.options.length > 0" class="q-options-grid">
            <div
              v-for="(opt, oIdx) in q.options"
              :key="oIdx"
              class="q-option-chip"
            >
              <span class="opt-dot"></span>
              <span class="opt-label">{{ typeof opt === 'string' ? opt : (opt as any).label }}</span>
            </div>
          </div>

          <!-- Text placeholder -->
          <div v-if="q.type === 'text_input'" class="q-text-placeholder">
            {{ q.placeholder || '用户文本输入区...' }}
          </div>

          <!-- Jump rules info -->
          <div v-if="Array.isArray(q.jump) && q.jump.length > 0" class="q-jump-info">
            <span class="jump-title">跳转规则:</span>
            <span v-for="(rule, rIdx) in q.jump" :key="rIdx" class="jump-item">
              {{ rule.else ? '默认' : JSON.stringify(rule.when) }} <ArrowRight :size="10" /> {{ rule.to }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.survey-preview-panel {
  flex: 1;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.loading-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.survey-content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.survey-meta-header {
  position: relative;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 20px;
}

.version-watermark {
  position: absolute;
  top: 12px;
  right: 16px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.survey-name {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.survey-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.questions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  transition: all 0.15s ease;
}

.question-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.q-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.q-index {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.q-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
}

.q-options-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.q-option-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #334155;
}

.opt-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
}

.opt-label {
  line-height: 1.2;
}

.q-text-placeholder {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.q-jump-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #d97706;
  background: #fef3c7;
  padding: 4px 8px;
  border-radius: 4px;
}

.jump-title {
  font-weight: 700;
}

.jump-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
