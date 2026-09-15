<script setup lang="ts">
/**
 * src/console/components/AiSurveyEditorModal.vue
 *
 * AI Survey Editor modal container.
 * Integrates useSurveyEditor, EditorPreviewPanel, and EditorChatPanel.
 */

import { watch } from 'vue';
import {
  NModal,
  NCard,
  NButton,
  NTag,
  useMessage,
} from 'naive-ui';
import {
  Sparkles,
  Check,
  RotateCcw,
  PlusCircle,
  Edit3,
  Trash2,
} from 'lucide-vue-next';
import type { SurveyMetadataItem } from '../../services/questionnaire-repository-service';
import { useSurveyEditor } from '../../composables/useSurveyEditor';
import EditorPreviewPanel from './editor/EditorPreviewPanel.vue';
import EditorChatPanel from './editor/EditorChatPanel.vue';

const props = defineProps<{
  show: boolean;
  survey: SurveyMetadataItem | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'survey-updated', surveyId: string): void;
}>();

const message = useMessage();

const {
  loading,
  chatLoading,
  applyingLoading,
  session,
  activeViewVersion,
  userPromptInput,
  currentSurveyModel,
  diffSummary,
  initSession,
  resetSession,
  sendMessage,
  applyChanges,
  discardChanges,
} = useSurveyEditor(message);

watch(
  () => [props.show, props.survey?.id],
  async ([show, id]) => {
    if (show && id && props.survey) {
      try {
        await initSession(props.survey.id);
      } catch {
        emit('update:show', false);
      }
    } else {
      resetSession();
    }
  }
);

async function handleApply() {
  try {
    const surveyId = await applyChanges();
    emit('survey-updated', surveyId || props.survey?.id || '');
    emit('update:show', false);
  } catch {
    // Handled in composable
  }
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="false"
    style="width: 92vw; max-width: 1200px; height: 88vh;"
    @update:show="(val) => emit('update:show', val)"
  >
    <NCard
      class="ai-editor-card"
      :bordered="false"
      content-style="padding: 0; display: flex; flex-direction: column; height: 100%; overflow: hidden;"
    >
      <!-- Top header bar -->
      <div class="editor-header">
        <div class="header-left">
          <div class="title-badge">
            <Sparkles class="icon-sparkle" :size="18" />
            <span class="title-text">AI 问卷局部智能编辑</span>
          </div>
          <span class="survey-title-label">{{ props.survey?.title || '正在加载问卷...' }}</span>
        </div>

        <!-- Version toggle button group -->
        <div class="header-center">
          <div class="version-toggle-group">
            <button
              class="toggle-btn"
              :class="{ active: activeViewVersion === 'working' }"
              @click="activeViewVersion = 'working'"
            >
              当前版本
              <span v-if="diffSummary.hasChanges" class="change-dot"></span>
            </button>
            <button
              class="toggle-btn"
              :class="{ active: activeViewVersion === 'original' }"
              @click="activeViewVersion = 'original'"
            >
              原始版本
            </button>
          </div>
        </div>

        <!-- Header close button -->
        <div class="header-right">
          <NButton size="small" quaternary @click="emit('update:show', false)">关闭</NButton>
        </div>
      </div>

      <!-- Diff summary bar -->
      <div class="diff-summary-bar" :class="{ 'has-diff': diffSummary.hasChanges }">
        <div class="diff-stats">
          <span class="diff-title">本次修改：</span>
          <NTag type="success" size="small" round :bordered="false">
            <template #icon><PlusCircle :size="12" /></template>
            新增：{{ diffSummary.addedCount }}
          </NTag>
          <NTag type="warning" size="small" round :bordered="false">
            <template #icon><Edit3 :size="12" /></template>
            修改：{{ diffSummary.modifiedCount }}
          </NTag>
          <NTag type="error" size="small" round :bordered="false">
            <template #icon><Trash2 :size="12" /></template>
            删除：{{ diffSummary.deletedCount }}
          </NTag>
          <span v-if="!diffSummary.hasChanges" class="no-diff-hint">
            (当前与原始版本完全一致)
          </span>
        </div>

        <div class="action-buttons-group">
          <NButton
            v-if="diffSummary.hasChanges"
            size="small"
            secondary
            type="warning"
            @click="discardChanges"
          >
            <template #icon><RotateCcw :size="14" /></template>
            放弃修改
          </NButton>
          <NButton
            v-if="diffSummary.hasChanges"
            size="small"
            type="primary"
            :loading="applyingLoading"
            @click="handleApply"
          >
            <template #icon><Check :size="14" /></template>
            采纳修改并存盘
          </NButton>
        </div>
      </div>

      <!-- Main body split: Left live preview + Right AI chat -->
      <div class="editor-body">
        <EditorPreviewPanel
          :loading="loading"
          :active-view-version="activeViewVersion"
          :current-survey-model="currentSurveyModel"
        />

        <EditorChatPanel
          :session="session"
          :diff-summary="diffSummary"
          :user-prompt-input="userPromptInput"
          :chat-loading="chatLoading"
          @update:user-prompt-input="(val) => (userPromptInput = val)"
          @send-message="sendMessage"
        />
      </div>
    </NCard>
  </NModal>
</template>

<style scoped>
.ai-editor-card {
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  height: 54px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #ffffff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
}

.icon-sparkle {
  color: #fbbf24;
}

.survey-title-label {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-toggle-group {
  display: flex;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 8px;
  gap: 2px;
}

.toggle-btn {
  position: relative;
  border: none;
  background: transparent;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn.active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.change-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}

.diff-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  min-height: 44px;
}

.diff-summary-bar.has-diff {
  background: #eff6ff;
  border-bottom-color: #bfdbfe;
}

.diff-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diff-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.no-diff-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 4px;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.editor-body {
  flex: 1;
  display: flex;
  height: calc(100% - 54px - 44px);
  overflow: hidden;
}
</style>
