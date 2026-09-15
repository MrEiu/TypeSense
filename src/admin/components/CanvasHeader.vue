<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  NButton,
  NInput,
  NRadioGroup,
  NRadioButton,
  NSelect,
  NTooltip,
  type SelectOption,
} from 'naive-ui';
import {
  ArrowLeft,
  Edit3,
  ListOrdered,
  Layers,
  GitBranch,
  Save,
  ExternalLink,
  Undo2,
  Redo2,
} from 'lucide-vue-next';
import type { QuestionnaireModel } from '../../schema/questionnaire-schema-types';

const props = defineProps<{
  questionnaire: QuestionnaireModel | null;
  viewMode: 'editor' | 'flow' | 'split';
  allSurveys: Array<{ id: string; title: string; slug?: string }>;
  currentSurveyId: string;
  isDirty: boolean;
  isSaving: boolean;
  respondentUrl: string;
  surveySelectOptions: SelectOption[];
  canUndo?: boolean;
  canRedo?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:viewMode', val: 'editor' | 'flow' | 'split'): void;
  (e: 'update-title', newTitle: string): void;
  (e: 'survey-change', id: string): void;
  (e: 'save'): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'close'): void;
}>();

// Inline title editing
const isEditingTitle = ref(false);
const tempTitle = ref('');

watch(
  () => props.questionnaire?.title,
  (val) => {
    if (!isEditingTitle.value) {
      tempTitle.value = val || '';
    }
  },
  { immediate: true }
);

function startEditTitle() {
  if (!props.questionnaire) return;
  tempTitle.value = props.questionnaire.title;
  isEditingTitle.value = true;
}

function finishEditTitle() {
  if (props.questionnaire && tempTitle.value.trim()) {
    emit('update-title', tempTitle.value.trim());
  }
  isEditingTitle.value = false;
}
</script>

<template>
  <header class="studio-header">
    <div class="header-left">
      <NButton
        quaternary
        circle
        size="medium"
        title="返回控制台"
        @click="emit('close')"
      >
        <template #icon><ArrowLeft :size="18" /></template>
      </NButton>

      <div class="brand-badge-group">
        <span class="studio-badge">STUDIO</span>
        <span class="brand-title">TypeSense 逻辑编排</span>
      </div>

      <div class="header-v-divider"></div>

      <!-- Questionnaire title (inline editable) -->
      <div v-if="questionnaire" class="title-inline-box">
        <div
          v-if="!isEditingTitle"
          class="title-display"
          title="点击编辑问卷标题"
          @click="startEditTitle"
        >
          <span class="title-text">{{ questionnaire.title }}</span>
          <Edit3 :size="13" class="edit-icon" />
        </div>
        <NInput
          v-else
          v-model:value="tempTitle"
          size="small"
          style="width: 320px;"
          autofocus
          @blur="finishEditTitle"
          @keyup.enter="finishEditTitle"
        />
      </div>
    </div>

    <!-- Center View Mode Segment -->
    <div class="header-center">
      <NRadioGroup
        :value="viewMode"
        size="small"
        @update:value="(val) => emit('update:viewMode', val)"
      >
        <NRadioButton value="editor">
          <span class="radio-btn-content"><ListOrdered :size="14" /> 逻辑编排</span>
        </NRadioButton>
        <NRadioButton value="split">
          <span class="radio-btn-content"><Layers :size="14" /> 分屏协同</span>
        </NRadioButton>
        <NRadioButton value="flow">
          <span class="radio-btn-content"><GitBranch :size="14" /> 流程拓扑</span>
        </NRadioButton>
      </NRadioGroup>
    </div>

    <!-- Right Operations -->
    <div class="header-right">
      <!-- Undo / Redo controls -->
      <div v-if="canUndo !== undefined" class="undo-redo-group">
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton
              quaternary
              size="small"
              circle
              :disabled="!canUndo"
              @click="emit('undo')"
            >
              <template #icon><Undo2 :size="14" /></template>
            </NButton>
          </template>
          撤销 (Ctrl+Z)
        </NTooltip>
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton
              quaternary
              size="small"
              circle
              :disabled="!canRedo"
              @click="emit('redo')"
            >
              <template #icon><Redo2 :size="14" /></template>
            </NButton>
          </template>
          重做 (Ctrl+Y)
        </NTooltip>
      </div>

      <!-- Survey switch -->
      <NSelect
        v-if="allSurveys.length > 1"
        :value="currentSurveyId"
        :options="surveySelectOptions"
        size="small"
        style="min-width: 160px; max-width: 220px;"
        @update:value="(val) => emit('survey-change', String(val))"
      />

      <!-- Save button -->
      <NButton
        :type="isDirty ? 'primary' : 'default'"
        size="small"
        :loading="isSaving"
        @click="emit('save')"
      >
        <template #icon><Save :size="14" /></template>
        <span>{{ isDirty ? '保存改动 *' : '已保存' }}</span>
      </NButton>

      <!-- Preview respondent URL -->
      <NButton
        v-if="questionnaire"
        tag="a"
        :href="respondentUrl"
        target="_blank"
        size="small"
        secondary
        type="info"
      >
        <template #icon><ExternalLink :size="14" /></template>
        <span>受访体验</span>
      </NButton>
    </div>
  </header>
</template>

<style scoped>
.studio-header {
  height: 56px;
  background: #ffffff;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 30;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-badge-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.studio-badge {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.brand-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}

.header-v-divider {
  width: 1px;
  height: 20px;
  background: rgba(15, 23, 42, 0.08);
  margin: 0 4px;
}

.title-inline-box {
  display: flex;
  align-items: center;
}

.title-display {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}

.title-display:hover {
  background: #f1f5f9;
}

.title-text {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-icon {
  color: #94a3b8;
}

.header-center {
  display: flex;
  align-items: center;
}

.radio-btn-content {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.undo-redo-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
