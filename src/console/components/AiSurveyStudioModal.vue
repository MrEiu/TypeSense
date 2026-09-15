<script setup lang="ts">
import { ref, computed, watch, onMounted, h } from 'vue';
import {
  NModal,
  NButton,
  NInput,
  NSlider,
  NSwitch,
  useMessage,
  useNotification,
} from 'naive-ui';
import {
  Sparkles,
  UploadCloud,
  FileText,
  Trash2,
  RefreshCw,
  Check,
  Zap,
  Search,
  BookOpen,
  X,
  ArrowRight,
  ArrowLeft,
} from 'lucide-vue-next';
import {
  AiGeneratorClientService,
  type DocumentItem,
  type LogicTemplateItem,
} from '../../services/ai-generator-client-service';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'created'): void;
}>();

const message = useMessage();
const notification = useNotification();

// 多层卡片向导核心控制
const activeCardStep = ref<1 | 2 | 3>(1);
const slideDirection = ref<'next' | 'prev'>('next');

// 卡片 1：知识基座 (文档搜索过滤与上传切换)
const docSearchQuery = ref('');
const docTabMode = ref<'history' | 'upload'>('history');
const documents = ref<DocumentItem[]>([]);
const selectedDocId = ref<string | null>(null);
const isUploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// 卡片 2：预设题量与提示词
const userPrompt = ref('');
const targetCount = ref(10);
const questionCountPresets = [5, 10, 20, 40, 80];

// 卡片 3：逻辑与模板
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

function isWordDoc(filename: string): boolean {
  const lower = (filename || '').toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.doc');
}

function goToStep(step: 1 | 2 | 3) {
  if (step === activeCardStep.value) return;
  slideDirection.value = step > activeCardStep.value ? 'next' : 'prev';
  activeCardStep.value = step;
}

function nextStep() {
  if (activeCardStep.value < 3) {
    slideDirection.value = 'next';
    activeCardStep.value = (activeCardStep.value + 1) as 1 | 2 | 3;
  }
}

function prevStep() {
  if (activeCardStep.value > 1) {
    slideDirection.value = 'prev';
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
    console.error('加载文档列表失败:', err);
  }
}

async function loadLogicTemplates() {
  try {
    logicTemplates.value = await AiGeneratorClientService.listLogicTemplates();
  } catch (err) {
    console.error('加载逻辑模板列表失败:', err);
  }
}

function triggerFileSelect() {
  fileInputRef.value?.click();
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
    if (fileInputRef.value) fileInputRef.value.value = '';
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
  slideDirection.value = 'next';
  docSearchQuery.value = '';
  docTabMode.value = 'history';
  userPrompt.value = '';
  selectedDocId.value = null;
  selectedTemplateIds.value = [];
}

/**
 * 启动后台 AI 智造（后台异步执行第二套单次直出，弹窗即刻关闭）
 */
function handleStartGenerate() {
  const prompt = userPrompt.value.trim() || '企业业务综合满意度与全流程体验调研';
  const documentId = selectedDocId.value || undefined;
  const templateIds = selectedTemplateIds.value.length > 0 ? [...selectedTemplateIds.value] : undefined;
  const count = targetCount.value;
  const jump = enableJumpLogic.value;

  // 1. 即刻关闭弹窗并重置向导
  emit('update:show', false);
  resetStudioState();

  // 2. 弹出右下角后台启动提示
  notification.info({
    title: 'AI 问卷智造已在后台启动',
    content: `正在为您单次直出约 ${count} 题问卷与流转逻辑，生成后将自动通知并刷新列表...`,
    duration: 4000,
  });

  // 3. 后台单次极速直出与自动入库
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

    <!-- 向导卡片表单 -->
    <div class="wizard-container">
      <!-- 顶部 3 步导航条 -->
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

      <!-- 卡片主体内容 -->
      <div class="step-card-body">
        <!-- 卡片 1: 知识基座 -->
        <div v-if="activeCardStep === 1" class="step-content">
          <div class="doc-subtab-switch">
            <button
              type="button"
              class="doc-subtab-btn"
              :class="{ 'is-active': docTabMode === 'history' }"
              @click="docTabMode = 'history'"
            >
              <BookOpen :size="13" />
              <span>从历史文档库挑选 ({{ documents.length }})</span>
            </button>
            <button
              type="button"
              class="doc-subtab-btn"
              :class="{ 'is-active': docTabMode === 'upload' }"
              @click="docTabMode = 'upload'"
            >
              <UploadCloud :size="13" />
              <span>上传新 Word 文档</span>
            </button>
          </div>

          <!-- 历史文档列表 -->
          <div v-if="docTabMode === 'history'" class="doc-tab-content">
            <div class="doc-search-bar">
              <Search :size="14" class="search-icon" />
              <input
                v-model="docSearchQuery"
                type="text"
                placeholder="搜索历史文档名称或摘要..."
                class="doc-search-input"
              />
              <button v-if="docSearchQuery" type="button" class="clear-search-btn" @click="docSearchQuery = ''">
                <X :size="12" />
              </button>
            </div>

            <div class="doc-cards-list">
              <div
                v-for="d in filteredDocuments"
                :key="d.id"
                class="doc-item-card"
                :class="{ 'is-selected': selectedDocId === d.id }"
                @click="selectDoc(d.id)"
              >
                <div class="doc-card-top">
                  <div class="doc-format-tag" :class="{ 'is-word': isWordDoc(d.originalName) }">
                    <FileText :size="12" />
                    <span>{{ isWordDoc(d.originalName) ? 'WORD' : d.originalName.split('.').pop()?.toUpperCase() || 'DOC' }}</span>
                  </div>
                  <span class="doc-item-name" :title="d.originalName">{{ d.originalName }}</span>
                  <button
                    type="button"
                    class="doc-item-del-btn"
                    title="从知识库删除此文档"
                    @click.stop="handleDeleteDoc(d.id)"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>
                <div class="doc-item-meta">
                  <span class="doc-meta-chars">{{ d.charCount.toLocaleString() }} 字符</span>
                  <span class="doc-meta-dot">·</span>
                  <span class="doc-meta-date">{{ d.createdAt?.slice(0, 10) }}</span>
                </div>
                <div v-if="d.summary" class="doc-item-summary">
                  {{ d.summary.slice(0, 68) }}{{ d.summary.length > 68 ? '...' : '' }}
                </div>
                <div v-if="selectedDocId === d.id" class="doc-selected-badge">
                  <Check :size="11" />
                  <span>已选定</span>
                </div>
              </div>

              <div v-if="filteredDocuments.length === 0" class="doc-empty-state">
                <p v-if="docSearchQuery">未找到与 "{{ docSearchQuery }}" 匹配的历史文档</p>
                <p v-else>暂无历史文档，可点击上方「上传新 Word 文档」立即上传</p>
              </div>
            </div>
          </div>

          <!-- 上传新文档 -->
          <div v-else class="doc-tab-content">
            <input
              ref="fileInputRef"
              type="file"
              accept=".docx,.doc,.pdf,.txt,.md"
              style="display: none;"
              @change="handleFileUpload"
            />
            <div
              class="doc-dropzone"
              :class="{ 'is-uploading': isUploading }"
              @click="triggerFileSelect"
            >
              <div class="dropzone-icon">
                <UploadCloud v-if="!isUploading" :size="28" />
                <RefreshCw v-else :size="28" class="anim-spin" />
              </div>
              <div class="dropzone-title">
                {{ isUploading ? '正在解析 Word 文档...' : '点击或将 Word 文档拖拽至此' }}
              </div>
              <div class="dropzone-sub">
                深度支持 .docx / .doc，智能抽取标题、题组与段落语义；亦兼容 .pdf / .txt / .md
              </div>
            </div>
          </div>

          <!-- 底部已选提示与下一步 -->
          <div class="card-footer-nav">
            <div class="selection-status-hint">
              <span v-if="selectedDocId">已选用文档: <strong>{{ activeDoc?.originalName }}</strong></span>
              <button v-if="selectedDocId" type="button" class="clear-selection-link" @click="clearDocSelection">
                清除
              </button>
            </div>
            <NButton type="primary" size="medium" @click="nextStep">
              <span>下一步：设定题目与提示词</span>
              <template #icon><ArrowRight :size="14" /></template>
            </NButton>
          </div>
        </div>

        <!-- 卡片 2: 规模与提示词 -->
        <div v-if="activeCardStep === 2" class="step-content">
          <!-- 提示词输入 -->
          <div class="form-section">
            <label class="form-label">调研核心意图 / 提示词 (Prompt)</label>
            <NInput
              v-model:value="userPrompt"
              type="textarea"
              :rows="3"
              placeholder="请输入调研主题、考察目的或特定题型要求（如：针对研发团队的 AI 工具交付效率与工程满意度调研）..."
            />
          </div>

          <!-- 题目规模预设 -->
          <div class="form-section">
            <label class="form-label">期望题目规模: <strong>{{ targetCount }}</strong> 题</label>
            <div class="count-presets-grid">
              <button
                v-for="count in questionCountPresets"
                :key="count"
                type="button"
                class="count-preset-card"
                :class="{ 'is-selected': targetCount === count }"
                @click="targetCount = count"
              >
                <div class="preset-count-num">{{ count }} 题</div>
              </button>
            </div>
            <div style="margin-top: 10px;">
              <NSlider v-model:value="targetCount" :min="1" :max="80" :step="1" />
            </div>
          </div>

          <div class="card-footer-nav dual-btn">
            <NButton secondary size="medium" @click="prevStep">
              <template #icon><ArrowLeft :size="14" /></template>
              <span>上一步</span>
            </NButton>
            <NButton type="primary" size="medium" @click="nextStep">
              <span>下一步：拓扑流转与模板</span>
              <template #icon><ArrowRight :size="14" /></template>
            </NButton>
          </div>
        </div>

        <!-- 卡片 3: 逻辑与模板 -->
        <div v-if="activeCardStep === 3" class="step-content">
          <!-- 跳转逻辑开关 -->
          <div class="jump-toggle-row">
            <div class="jump-toggle-info">
              <div class="jump-title-row">
                <Zap :size="16" class="jump-icon" />
                <span class="jump-title">是否启用逻辑</span>
              </div>
            </div>
            <NSwitch v-model:value="enableJumpLogic" />
          </div>

          <!-- 逻辑模板挑选 -->
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
                @click="toggleTemplate(tpl.id)"
              >
                <div class="tpl-chip-top">
                  <span class="tpl-name">{{ tpl.name }}</span>
                  <Check v-if="selectedTemplateIds.includes(tpl.id)" :size="12" class="tpl-check" />
                </div>
                <div v-if="tpl.description" class="tpl-desc">{{ tpl.description }}</div>
              </div>
            </div>
          </div>

          <!-- 总览与启动生成 -->
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

          <div class="card-footer-nav dual-btn">
            <NButton secondary size="medium" @click="prevStep">
              <template #icon><ArrowLeft :size="14" /></template>
              <span>上一步</span>
            </NButton>
            <NButton
              type="primary"
              size="medium"
              class="start-generate-btn"
              @click="handleStartGenerate"
            >
              <template #icon><Sparkles :size="16" /></template>
              <span>立即启动 AI 智造 (后台生成)</span>
            </NButton>
          </div>
        </div>
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

.modal-subtitle {
  font-size: 12px;
  color: #64748b;
}

.wizard-container {
  padding: 6px 0;
}

/* 顶部 Stepper 指示器 */
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

.step-sub {
  font-size: 11px;
  color: #94a3b8;
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

/* 卡片内容区域 */
.step-card-body {
  min-height: 380px;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-step-header {
  margin-bottom: 4px;
}

.card-step-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.card-step-desc {
  font-size: 12px;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}

/* 文档选项卡切换 */
.doc-subtab-switch {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 8px;
}

.doc-subtab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.doc-subtab-btn.is-active {
  background: #e0e7ff;
  color: #4f46e5;
}

.doc-search-bar {
  display: flex;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
  gap: 8px;
  margin-bottom: 10px;
}

.search-icon {
  color: #94a3b8;
}

.doc-search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  flex: 1;
  color: #1e293b;
}

.clear-search-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.doc-cards-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-item-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.doc-item-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.doc-item-card.is-selected {
  border-color: #4f46e5;
  background: #f5f3ff;
}

.doc-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-format-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #e2e8f0;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  color: #475569;
}

.doc-format-tag.is-word {
  background: #dbeafe;
  color: #1d4ed8;
}

.doc-item-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-item-del-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
}

.doc-item-del-btn:hover {
  color: #ef4444;
}

.doc-item-meta {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

.doc-item-summary {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
  line-height: 1.4;
}

.doc-selected-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #4f46e5;
  color: #ffffff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.doc-empty-state {
  text-align: center;
  padding: 24px;
  color: #94a3b8;
  font-size: 12px;
}

.doc-dropzone {
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 36px 20px;
  text-align: center;
  cursor: pointer;
  background: #f8fafc;
  transition: all 0.2s;
}

.doc-dropzone:hover {
  border-color: #4f46e5;
  background: #f5f3ff;
}

.dropzone-icon {
  color: #4f46e5;
  margin-bottom: 8px;
}

.dropzone-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.dropzone-sub {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.card-footer-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}

.card-footer-nav.dual-btn {
  justify-content: space-between;
}

.selection-status-hint {
  font-size: 12px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 6px;
}

.clear-selection-link {
  background: transparent;
  border: none;
  color: #4f46e5;
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}

.dim-hint {
  color: #94a3b8;
}

/* 提示词与规模 */
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
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.count-preset-card:hover {
  border-color: #4f46e5;
}

.count-preset-card.is-selected {
  background: #e0e7ff;
  border-color: #4f46e5;
}

.preset-count-num {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.preset-count-label {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.preset-count-time {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
}

/* 跳转逻辑开关 */
.jump-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 16px;
}

.jump-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.jump-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.jump-icon {
  color: #eab308;
}

.jump-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.jump-sub {
  font-size: 11px;
  color: #64748b;
}

.template-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-sub {
  font-size: 11px;
  color: #94a3b8;
}

.template-chips-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
}

.template-chip {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-chip:hover {
  border-color: #cbd5e1;
}

.template-chip.is-selected {
  background: #f5f3ff;
  border-color: #4f46e5;
}

.tpl-chip-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  margin-top: 2px;
  line-height: 1.3;
}

.overview-summary-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  gap: 20px;
}

.overview-item {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

.ov-label {
  color: #94a3b8;
}

.ov-val {
  font-weight: 600;
  color: #1e293b;
}

.start-generate-btn {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: none;
}

</style>
