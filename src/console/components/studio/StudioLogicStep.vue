<script setup lang="ts">
/**
 * src/console/components/studio/StudioLogicStep.vue
 *
 * Wizard Step 3: Jump Logic Switch, Preset Logic Templates, Overview, and Generation Trigger.
 */

import { NSwitch, NButton } from 'naive-ui';
import { Zap, Check, Sparkles, ArrowLeft } from 'lucide-vue-next';
import type { LogicTemplateItem, DocumentItem } from '../../../services/ai-generator-client-service';

defineProps<{
  enableJumpLogic: boolean;
  logicTemplates: LogicTemplateItem[];
  selectedTemplateIds: string[];
  activeDoc: DocumentItem | null;
  targetCount: number;
}>();

const emit = defineEmits<{
  (e: 'update:enableJumpLogic', val: boolean): void;
  (e: 'toggle-template', id: string): void;
  (e: 'prev'): void;
  (e: 'start-generate'): void;
}>();
</script>

<template>
  <div class="step-content">
    <!-- Jump logic toggle -->
    <div class="jump-toggle-row">
      <div class="jump-toggle-info">
        <div class="jump-title-row">
          <Zap :size="16" class="jump-icon" />
          <span class="jump-title">是否启用逻辑分支</span>
        </div>
      </div>
      <NSwitch
        :value="enableJumpLogic"
        @update:value="(val) => emit('update:enableJumpLogic', val)"
      />
    </div>

    <!-- Logic templates selection -->
    <div class="form-section">
      <div class="template-header-row">
        <label class="form-label">组合预置专业逻辑模板 (可选)</label>
        <span class="template-sub">已选 {{ selectedTemplateIds.length }} 个模板</span>
      </div>

      <div class="template-chips-grid">
        <div
          v-for="tpl in logicTemplates"
          :key="tpl.id"
          class="template-chip"
          :class="{ 'is-selected': selectedTemplateIds.includes(tpl.id) }"
          @click="emit('toggle-template', tpl.id)"
        >
          <div class="tpl-chip-top">
            <span class="tpl-name">{{ tpl.name }}</span>
            <Check v-if="selectedTemplateIds.includes(tpl.id)" :size="12" class="tpl-check" />
          </div>
          <div v-if="tpl.description" class="tpl-desc">{{ tpl.description }}</div>
        </div>
      </div>
    </div>

    <!-- Overview summary box -->
    <div class="overview-summary-box">
      <div class="overview-item">
        <span class="ov-label">知识基座:</span>
        <span class="ov-val">{{ activeDoc ? activeDoc.originalName : '未选用文档' }}</span>
      </div>
      <div class="overview-item">
        <span class="ov-label">题目规模:</span>
        <span class="ov-val">{{ targetCount }} 题</span>
      </div>
      <div class="overview-item">
        <span class="ov-label">逻辑跳转:</span>
        <span class="ov-val">{{ enableJumpLogic ? '开启有向图分支' : '线性流转' }}</span>
      </div>
    </div>

    <!-- Footer action buttons -->
    <div class="card-footer-nav dual-btn">
      <NButton secondary size="medium" @click="emit('prev')">
        <template #icon><ArrowLeft :size="14" /></template>
        <span>上一步</span>
      </NButton>
      <NButton
        type="primary"
        size="medium"
        class="start-generate-btn"
        @click="emit('start-generate')"
      >
        <template #icon><Sparkles :size="16" /></template>
        <span>立即启动 AI 智造 (后台生成)</span>
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

.jump-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.jump-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jump-icon {
  color: #d97706;
}

.jump-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.template-sub {
  font-size: 11px;
  color: #94a3b8;
}

.template-chips-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
}

.template-chip {
  padding: 8px 10px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.template-chip:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.template-chip.is-selected {
  border-color: #6366f1;
  background: #eef2ff;
}

.tpl-chip-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tpl-name {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.tpl-check {
  color: #4f46e5;
}

.tpl-desc {
  font-size: 10px;
  color: #64748b;
  line-height: 1.3;
}

.overview-summary-box {
  display: flex;
  justify-content: space-around;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.overview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.ov-label {
  color: #64748b;
  font-weight: 500;
}

.ov-val {
  color: #0f172a;
  font-weight: 700;
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

.start-generate-btn {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: none;
}
</style>
