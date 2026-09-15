<script setup lang="ts">
/**
 * src/console/components/AiSurveyStudioModal.vue
 *
 * AI Survey Studio Modal wizard orchestrator.
 * Combines StudioDocumentStep, StudioPromptStep, and StudioLogicStep.
 */

import { ref, computed, watch, onMounted, h } from 'vue';
import {
  NModal,
  useMessage,
  useNotification,
} from 'naive-ui';
import { Sparkles, Check } from 'lucide-vue-next';
import {
  AiGeneratorClientService,
  type DocumentItem,
  type LogicTemplateItem,
} from '../../services/ai-generator-client-service';

import StudioDocumentStep from './studio/StudioDocumentStep.vue';
import StudioPromptStep from './studio/StudioPromptStep.vue';
import StudioLogicStep from './studio/StudioLogicStep.vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'created'): void;
}>();

const message = useMessage();
const notification = useNotification();

// Wizard active step
const activeCardStep = ref<1 | 2 | 3>(1);

// Step 1: Knowledge base state
const docSearchQuery = ref('');
const docTabMode = ref<'history' | 'upload'>('history');
const documents = ref<DocumentItem[]>([]);
const selectedDocId = ref<string | null>(null);
const isUploading = ref(false);

// Step 2: Prompt and scale state
const userPrompt = ref('');
const targetCount = ref(10);
const questionCountPresets = [5, 10, 20, 40, 80];

// Step 3: Logic and template state
const enableJumpLogic = ref(true);
const logicTemplates = ref<LogicTemplateItem[]>([]);
const selectedTemplateIds = ref<string[]>([]);

const activeDoc = computed(() => {
  return documents.value.find((d) => d.id === selectedDocId.value) || null;
});

const filteredDocuments = computed(() => {
  if (!docSearchQuery.value.trim()) return documents.value;
  const q = docSearchQuery.value.toLowerCase().trim();
  return documents.value.filter(
    (d) =>
      d.originalName.toLowerCase().includes(q) ||
      (d.summary && d.summary.toLowerCase().includes(q))
  );
});

function goToStep(step: 1 | 2 | 3) {
  activeCardStep.value = step;
}

function nextStep() {
  if (activeCardStep.value < 3) {
    activeCardStep.value = (activeCardStep.value + 1) as 1 | 2 | 3;
  }
}

function prevStep() {
  if (activeCardStep.value > 1) {
    activeCardStep.value = (activeCardStep.value - 1) as 1 | 2 | 3;
  }
}

function selectDoc(id: string) {
  selectedDocId.value = id;
}

function clearDocSelection() {
  selectedDocId.value = null;
}

function toggleTemplate(id: string) {
  const idx = selectedTemplateIds.value.indexOf(id);
  if (idx >= 0) {
    selectedTemplateIds.value.splice(idx, 1);
  } else {
    selectedTemplateIds.value.push(id);
  }
}

async function loadDocuments() {
  try {
    documents.value = await AiGeneratorClientService.listDocuments();
  } catch (err) {
    console.error('[Studio] Failed to load documents:', err);
  }
}

async function loadLogicTemplates() {
  try {
    logicTemplates.value = await AiGeneratorClientService.listLogicTemplates();
  } catch (err) {
    console.error('[Studio] Failed to load logic templates:', err);
  }
}

async function handleFileUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  isUploading.value = true;
  try {
    const uploaded = await AiGeneratorClientService.uploadDocument(file);
    documents.value.unshift(uploaded);
    selectedDocId.value = uploaded.id;
    docTabMode.value = 'history';
  } catch (err: any) {
    message.error(`文件上传失败: ${err.message}`);
  } finally {
    isUploading.value = false;
    target.value = '';
  }
}

async function handleDeleteDoc(id: string) {
  if (!confirm('确定从知识库删除此文档？')) return;
  const success = await AiGeneratorClientService.deleteDocument(id);
  if (success) {
    documents.value = documents.value.filter((d) => d.id !== id);
    if (selectedDocId.value === id) {
      selectedDocId.value = null;
    }
  }
}

function resetStudioState() {
  activeCardStep.value = 1;
  docSearchQuery.value = '';
  docTabMode.value = 'history';
  userPrompt.value = '';
  selectedDocId.value = null;
  selectedTemplateIds.value = [];
}

/**
 * Launch direct survey generation in the background
 */
function handleStartGenerate() {
  const prompt = userPrompt.value.trim();
  const documentId = selectedDocId.value || undefined;

  if (!prompt && !documentId) {
    message.warning('请至少输入调研诉求或选用一份知识库文档');
    return;
  }

  const templateIds = selectedTemplateIds.value.length > 0 ? [...selectedTemplateIds.value] : undefined;
  const count = targetCount.value;
  const jump = enableJumpLogic.value;

  emit('update:show', false);
  resetStudioState();

  notification.info({
    title: 'AI 问卷智造已在后台启动',
    content: `正在为您单次直出约 ${count} 题问卷与流转逻辑，生成后将自动通知并刷新列表...`,
    duration: 4000,
  });

  AiGeneratorClientService.generateDirectSurvey({
    prompt,
    documentId,
    templateIds,
    targetCount: count,
    enableJumpLogic: jump,
  })
    .then((res) => {
      const { survey, saved } = res;
      notification.success({
        title: '🎉 AI 问卷智造完成！',
        content: `《${survey.title}》（共 ${survey.questions.length} 题）已成功生成并存盘入库，列表已自动刷新。`,
        duration: 7000,
        action: () =>
          h(
            'div',
            { style: 'display: flex; gap: 10px; margin-top: 8px;' },
            [
              h(
                'a',
                {
                  href: saved.accessUrl,
                  target: '_blank',
                  style: 'color: #4f46e5; font-size: 12px; font-weight: 600; text-decoration: underline;',
                },
                '立即作答体验'
              ),
              h(
                'a',
                {
                  href: saved.canvasUrl,
                  target: '_blank',
                  style: 'color: #0284c7; font-size: 12px; font-weight: 600; text-decoration: underline;',
                },
                'Studio 逻辑编排'
              ),
            ]
          ),
      });
      emit('created');
    })
    .catch((err: any) => {
      notification.error({
        title: 'AI 问卷智造失败',
        content: err?.message || '后台生成遇到错误，请检查大模型服务配置。',
        duration: 7000,
      });
    });
}

function handleClose() {
  emit('update:show', false);
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      loadDocuments();
      loadLogicTemplates();
    }
  }
);

onMounted(() => {
  loadDocuments();
  loadLogicTemplates();
});
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="ai-studio-wizard-modal"
    style="width: 90vw; max-width: 780px;"
    @update:show="handleClose"
  >
    <template #header>
      <div class="modal-header-custom">
        <div class="ai-spark-badge">
          <Sparkles :size="18" class="spark-icon" />
        </div>
        <div class="header-titles">
          <h3 class="modal-title">AI 问卷智造工坊</h3>
        </div>
      </div>
    </template>

    <!-- Wizard container -->
    <div class="wizard-container">
      <!-- 3-step header indicator -->
      <div class="stepper-nav-bar">
        <button
          type="button"
          class="step-nav-btn"
          :class="{ 'is-active': activeCardStep === 1, 'is-done': !!selectedDocId }"
          @click="goToStep(1)"
        >
          <div class="step-num">
            <Check v-if="selectedDocId" :size="12" />
            <span v-else>1</span>
          </div>
          <div class="step-label-group">
            <span class="step-name">知识基座</span>
          </div>
        </button>

        <div class="step-line" :class="{ 'is-active': activeCardStep > 1 }"></div>

        <button
          type="button"
          class="step-nav-btn"
          :class="{ 'is-active': activeCardStep === 2, 'is-done': !!userPrompt.trim() }"
          @click="goToStep(2)"
        >
          <div class="step-num">
            <Check v-if="userPrompt.trim()" :size="12" />
            <span v-else>2</span>
          </div>
          <div class="step-label-group">
            <span class="step-name">规模与提示</span>
          </div>
        </button>

        <div class="step-line" :class="{ 'is-active': activeCardStep > 2 }"></div>

        <button
          type="button"
          class="step-nav-btn"
          :class="{ 'is-active': activeCardStep === 3 }"
          @click="goToStep(3)"
        >
          <div class="step-num">
            <span>3</span>
          </div>
          <div class="step-label-group">
            <span class="step-name">逻辑与模板</span>
          </div>
        </button>
      </div>

      <!-- Card body -->
      <div class="step-card-body">
        <!-- Step 1: Knowledge Base Documents -->
        <StudioDocumentStep
          v-if="activeCardStep === 1"
          :documents="documents"
          :filtered-documents="filteredDocuments"
          :selected-doc-id="selectedDocId"
          :active-doc="activeDoc"
          :doc-search-query="docSearchQuery"
          :doc-tab-mode="docTabMode"
          :is-uploading="isUploading"
          @update:doc-search-query="(val) => (docSearchQuery = val)"
          @update:doc-tab-mode="(val) => (docTabMode = val)"
          @select-doc="selectDoc"
          @clear-doc="clearDocSelection"
          @delete-doc="handleDeleteDoc"
          @file-upload="handleFileUpload"
          @next="nextStep"
        />

        <!-- Step 2: Prompt and Scale -->
        <StudioPromptStep
          v-if="activeCardStep === 2"
          :user-prompt="userPrompt"
          :target-count="targetCount"
          :question-count-presets="questionCountPresets"
          @update:user-prompt="(val) => (userPrompt = val)"
          @update:target-count="(val) => (targetCount = val)"
          @prev="prevStep"
          @next="nextStep"
        />

        <!-- Step 3: Logic and Templates -->
        <StudioLogicStep
          v-if="activeCardStep === 3"
          :enable-jump-logic="enableJumpLogic"
          :logic-templates="logicTemplates"
          :selected-template-ids="selectedTemplateIds"
          :active-doc="activeDoc"
          :target-count="targetCount"
          @update:enable-jump-logic="(val) => (enableJumpLogic = val)"
          @toggle-template="toggleTemplate"
          @prev="prevStep"
          @start-generate="handleStartGenerate"
        />
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.ai-studio-wizard-modal {
  border-radius: 16px;
  overflow: hidden;
}

.modal-header-custom {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-spark-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #4f46e5, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}

.wizard-container {
  padding: 6px 0;
}

.stepper-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
  padding: 10px 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.step-nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: all 0.2s;
}

.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.step-nav-btn.is-active .step-num {
  background: #4f46e5;
  color: #ffffff;
}

.step-nav-btn.is-done .step-num {
  background: #10b981;
  color: #ffffff;
}

.step-label-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.step-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.step-nav-btn.is-active .step-name {
  color: #4f46e5;
}

.step-line {
  flex: 1;
  height: 2px;
  background: #e2e8f0;
  margin: 0 12px;
}

.step-line.is-active {
  background: #4f46e5;
}

.step-card-body {
  min-height: 380px;
}
</style>
