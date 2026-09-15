<script setup lang="ts">
/**
 * src/admin/AdminCanvasApp.vue
 *
 * Questionnaire Studio orchestrator app.
 * Integrates CanvasHeader, CanvasSidebar, CanvasInspector, SurveyFlowCanvas, and useCanvasGraph.
 */

import { ref, onMounted, onUnmounted } from 'vue';
import {
  NConfigProvider,
  NNotificationProvider,
  NMessageProvider,
  NSpin,
  NButton,
  NEmpty,
  type GlobalThemeOverrides,
} from 'naive-ui';
import { AlertCircle } from 'lucide-vue-next';
import { useCanvasGraph } from '../composables/useCanvasGraph';
import { QuestionnaireRepositoryService } from '../services/questionnaire-repository-service';
import CanvasHeader from './components/CanvasHeader.vue';
import CanvasSidebar from './components/CanvasSidebar.vue';
import CanvasInspector from './components/CanvasInspector.vue';
import CanvasBatchOptionModal from './components/CanvasBatchOptionModal.vue';
import SurveyFlowCanvas from '../canvas/components/SurveyFlowCanvas.vue';

// Global theme tokens matching console aesthetics
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#4f46e5',
    primaryColorHover: '#4338ca',
    primaryColorPressed: '#3730a3',
    primaryColorSuppl: '#4f46e5',
    borderRadius: '8px',
  },
  Card: {
    borderRadius: '10px',
  },
};

// Headless canvas graph composable
const {
  isLoading,
  isSaving,
  isDirty,
  currentSurveyId,
  questionnaire,
  allSurveys,
  outlineSearchQuery,
  viewMode,
  activeQuestionIndex,
  currentQuestion,
  respondentUrl,
  surveySelectOptions,
  filteredQuestions,
  jumpTargetOptions,
  canUndo,
  canRedo,
  markDirty,
  undo,
  redo,
  loadSurvey,
  saveSurvey,
  selectQuestion,
  selectQuestionById,
  addQuestion,
  deleteQuestion,
  duplicateQuestion,
  moveQuestion,
  handleQuestionTypeChange,
  addStatement,
  removeStatement,
  updateStatementText,
  addOption,
  removeOption,
  updateOptionText,
  applyLikertPreset,
  applyBatchOptions,
  getConditionalJumpRules,
  addJumpRule,
  removeJumpRule,
  updateRuleOptionChoice,
  updateRuleTarget,
  updateTitle,
} = useCanvasGraph();

// Modal state for batch option importing
const showBatchOptionModal = ref(false);

// Return to console navigation
function handleClosePage() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
}

// Canvas node selection synchronization
function handleCanvasSelectQuestion(nodeId: string) {
  selectQuestionById(nodeId);
}

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const requestedId = urlParams.get('id') || urlParams.get('survey');

  try {
    const list = await QuestionnaireRepositoryService.listSurveys();
    allSurveys.value = list.map((s) => ({ id: s.id, title: s.title, slug: s.slug }));

    if (requestedId) {
      await loadSurvey(requestedId);
    } else if (list.length > 0) {
      await loadSurvey(list[0].id);
    } else {
      isLoading.value = false;
    }
  } catch (err) {
    console.error('[Studio] Initial survey loading error:', err);
    isLoading.value = false;
  }

  // Global keyboard shortcuts: Ctrl+S (Save), Ctrl+Z (Undo), Ctrl+Y/Shift+Ctrl+Z (Redo)
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveSurvey();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        e.preventDefault();
        redo();
      } else {
        e.preventDefault();
        undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
});
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NNotificationProvider placement="bottom-right">
      <NMessageProvider>
        <div class="studio-app-root">
          <!-- Studio Header -->
          <CanvasHeader
            :questionnaire="questionnaire"
            :view-mode="viewMode"
            :all-surveys="allSurveys"
            :current-survey-id="currentSurveyId"
            :is-dirty="isDirty"
            :is-saving="isSaving"
            :respondent-url="respondentUrl"
            :survey-select-options="surveySelectOptions"
            :can-undo="canUndo"
            :can-redo="canRedo"
            @update:view-mode="(val) => (viewMode = val)"
            @update-title="updateTitle"
            @survey-change="loadSurvey"
            @save="() => saveSurvey()"
            @undo="undo"
            @redo="redo"
            @close="handleClosePage"
          />

          <!-- Main Stage -->
          <main class="studio-main-body">
            <!-- Loading indicator -->
            <div v-if="isLoading" class="studio-state-stage">
              <NSpin size="large" />
              <p class="state-hint">正在从数据库装载问卷数据...</p>
            </div>

            <!-- Survey not found empty state -->
            <div v-else-if="!questionnaire" class="studio-state-stage">
              <AlertCircle :size="48" style="color: #94a3b8;" />
              <h3 class="state-title">未找到对应的问卷数据</h3>
              <p class="state-hint">请确认问卷 ID 是否正确，或返回控制台重新进入。</p>
              <NButton type="primary" size="medium" @click="handleClosePage">
                ← 返回控制台
              </NButton>
            </div>

            <!-- Flow canvas fullscreen view -->
            <div v-else-if="viewMode === 'flow'" class="flow-fullscreen-stage">
              <SurveyFlowCanvas
                :key="currentSurveyId"
                :questionnaire="questionnaire"
                @select-question="handleCanvasSelectQuestion"
              />
            </div>

            <!-- Editor / Split Workspace Container -->
            <div v-else class="studio-workspace-container" :class="{ 'is-split-mode': viewMode === 'split' }">
              <!-- Outline Sidebar -->
              <CanvasSidebar
                :questionnaire="questionnaire"
                :active-question-index="activeQuestionIndex"
                :filtered-questions="filteredQuestions"
                :outline-search-query="outlineSearchQuery"
                @update:outline-search-query="(val) => (outlineSearchQuery = val)"
                @select-question="selectQuestion"
                @add-question="addQuestion"
                @move-question="moveQuestion"
                @duplicate-question="duplicateQuestion"
                @delete-question="deleteQuestion"
              />

              <!-- Question Inspector -->
              <CanvasInspector
                v-if="currentQuestion"
                :current-question="currentQuestion"
                :active-question-index="activeQuestionIndex"
                :questionnaire="questionnaire"
                :jump-target-options="jumpTargetOptions"
                :conditional-jump-rules="getConditionalJumpRules()"
                @type-change="handleQuestionTypeChange"
                @mark-dirty="markDirty"
                @add-statement="addStatement"
                @remove-statement="removeStatement"
                @update-statement="updateStatementText"
                @add-option="addOption"
                @remove-option="removeOption"
                @update-option="updateOptionText"
                @apply-preset="applyLikertPreset"
                @open-batch-modal="showBatchOptionModal = true"
                @add-jump-rule="addJumpRule"
                @remove-jump-rule="removeJumpRule"
                @update-rule-choice="updateRuleOptionChoice"
                @update-rule-target="updateRuleTarget"
              />
              <div v-else class="inspector-empty-placeholder">
                <NEmpty description="暂无选中的题目" />
              </div>

              <!-- Split Mode Flow Canvas Aside -->
              <aside v-if="viewMode === 'split'" class="split-canvas-sidebar">
                <SurveyFlowCanvas
                  :key="currentSurveyId"
                  :questionnaire="questionnaire"
                  @select-question="handleCanvasSelectQuestion"
                />
              </aside>
            </div>
          </main>

          <!-- Batch Option Modal -->
          <CanvasBatchOptionModal
            v-model:show="showBatchOptionModal"
            @apply="applyBatchOptions"
          />
        </div>
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>

<style scoped>
.studio-app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background-color: #f8fafc;
  color: #0f172a;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.studio-main-body {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.studio-state-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
}

.state-title {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.state-hint {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.flow-fullscreen-stage {
  width: 100%;
  height: 100%;
}

.studio-workspace-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.inspector-empty-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}

.split-canvas-sidebar {
  width: 45%;
  height: 100%;
  border-left: 1px solid rgba(15, 23, 42, 0.08);
}
</style>
