<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import {
  NModal,
  NButton,
  NInput,
  NSlider,
  NSwitch,
  NSelect,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui';
import {
  Sparkles,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  ArrowRight,
  Trash2,
  Cpu,
  RefreshCw,
} from 'lucide-vue-next';
import {
  AiGeneratorClientService,
  type DocumentItem,
  type AiPipelineStreamEvent,
} from '../../services/ai-generator-client-service';
import type { QuestionnaireModel, QuestionItemModel } from '../../schema/questionnaire-schema-types';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'created'): void;
}>();

// 状态定义
const documents = ref<DocumentItem[]>([]);
const selectedDocId = ref<string | null>(null);
const isUploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// 参数配置
const userPrompt = ref('全面评估团队在业务开发、架构稳定性与工具链落地中的真实实践与瓶颈');
const targetCount = ref(8);
const enableJumpLogic = ref(true);

// 流水线运行状态
const isGenerating = ref(false);
const currentStage = ref<'idle' | 'planning' | 'drafting' | 'weaving' | 'auditing' | 'completed'>('idle');
const stageMessage = ref('');
const blueprint = ref<any>(null);
const streamedQuestions = ref<QuestionItemModel[]>([]);
const auditLogs = ref<string[]>([]);
const finalSurvey = ref<QuestionnaireModel | null>(null);
const persistedInfo = ref<{ surveyId: string; accessUrl: string; canvasUrl: string } | null>(null);
const errorMessage = ref<string | null>(null);
const questionStreamContainerRef = ref<HTMLElement | null>(null);

const activeDoc = computed(() => {
  return documents.value.find((d) => d.id === selectedDocId.value) || null;
});

const docOptions = computed(() => {
  return documents.value.map((d) => ({
    label: `${d.originalName} (${d.charCount.toLocaleString()} 字)`,
    value: d.id,
  }));
});

// 加载知识库文档列表
async function loadDocuments() {
  try {
    documents.value = await AiGeneratorClientService.listDocuments();
    if (documents.value.length > 0 && !selectedDocId.value) {
      selectedDocId.value = documents.value[0].id;
    }
  } catch (err) {
    console.error('加载文档列表失败:', err);
  }
}

// 触发本地文件选择
function triggerFileSelect() {
  fileInputRef.value?.click();
}

// 处理本地文件上传
async function handleFileUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  isUploading.value = true;
  try {
    const uploaded = await AiGeneratorClientService.uploadDocument(file);
    documents.value.unshift(uploaded);
    selectedDocId.value = uploaded.id;
  } catch (err: any) {
    alert(`文件上传失败: ${err.message}`);
  } finally {
    isUploading.value = false;
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
}

// 删除知识文档
async function handleDeleteDoc(id: string) {
  if (!confirm('确定从知识库删除此文档？')) return;
  const success = await AiGeneratorClientService.deleteDocument(id);
  if (success) {
    documents.value = documents.value.filter((d) => d.id !== id);
    if (selectedDocId.value === id) {
      selectedDocId.value = documents.value[0]?.id || null;
    }
  }
}

// 快捷提示词预设填入
function setPromptQuick(text: string) {
  userPrompt.value = text;
}

// 启动四阶智造流水线
async function startPipeline() {
  isGenerating.value = true;
  currentStage.value = 'planning';
  stageMessage.value = '正在连接智能体引擎，规划全景蓝图...';
  blueprint.value = null;
  streamedQuestions.value = [];
  auditLogs.value = [];
  finalSurvey.value = null;
  persistedInfo.value = null;
  errorMessage.value = null;

  try {
    await AiGeneratorClientService.startGenerationStream(
      {
        documentId: selectedDocId.value || undefined,
        prompt: userPrompt.value,
        targetCount: targetCount.value,
        enableJumpLogic: enableJumpLogic.value,
      },
      (event: AiPipelineStreamEvent) => {
        if (event.type === 'stage_start') {
          currentStage.value = event.stage || 'planning';
          stageMessage.value = event.message || '';
        } else if (event.type === 'blueprint_ready') {
          blueprint.value = event.blueprint;
        } else if (event.type === 'question_drafted') {
          currentStage.value = 'drafting';
          streamedQuestions.value.push(event.question);
          nextTick(() => {
            if (questionStreamContainerRef.value) {
              questionStreamContainerRef.value.scrollTop = questionStreamContainerRef.value.scrollHeight;
            }
          });
        } else if (event.type === 'logic_woven') {
          currentStage.value = 'weaving';
          if (event.questionsWithLogic) {
            streamedQuestions.value = event.questionsWithLogic;
          }
        } else if (event.type === 'audited') {
          currentStage.value = 'auditing';
          auditLogs.value = event.auditLog || [];
        } else if (event.type === 'persisted') {
          persistedInfo.value = {
            surveyId: event.surveyId || '',
            accessUrl: event.accessUrl || '',
            canvasUrl: event.canvasUrl || '',
          };
        } else if (event.type === 'completed') {
          currentStage.value = 'completed';
          finalSurvey.value = event.survey || null;
          emit('created');
        } else if (event.type === 'error') {
          errorMessage.value = event.error || '生成失败';
        }
      }
    );
  } catch (err: any) {
    errorMessage.value = err?.message || '生成中断';
  } finally {
    isGenerating.value = false;
  }
}

onMounted(() => {
  loadDocuments();
});
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="ai-studio-modal"
    :mask-closable="!isGenerating"
    :closable="!isGenerating"
    style="max-width: 1160px; width: 95vw;"
    @update:show="emit('update:show', $event)"
  >
    <template #header>
      <div class="modal-header-custom">
        <div class="ai-spark-badge">
          <Sparkles :size="18" class="spark-icon" />
        </div>
        <div>
          <h2 class="modal-title">AI 问卷智造工坊 (Agentic Survey Studio)</h2>
          <span class="modal-subtitle">文档知识萃取 · 四阶渐进编排 · 拓扑闭环自愈</span>
        </div>
      </div>
    </template>

    <div class="studio-layout">
      <!-- 左侧：知识库与参数控制台 -->
      <section class="left-config-panel">
        <!-- 1. 文档知识库管理 -->
        <div class="panel-section">
          <div class="section-title-line">
            <span class="section-title">1. 文档知识上下文</span>
            <span class="hint-tag">支持 PDF / DOCX / MD</span>
          </div>

          <!-- 上传与选择栏 -->
          <div class="doc-selector-group">
            <NSelect
              v-model:value="selectedDocId"
              :options="docOptions"
              placeholder="从知识库选择已有文档..."
              :disabled="isGenerating || isUploading"
              class="doc-select-dropdown"
            />

            <input
              ref="fileInputRef"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              style="display: none;"
              @change="handleFileUpload"
            />

            <button
              type="button"
              class="upload-trigger-btn"
              :disabled="isGenerating || isUploading"
              @click="triggerFileSelect"
            >
              <UploadCloud :size="15" />
              <span>{{ isUploading ? '解析中...' : '上传新文档' }}</span>
            </button>
          </div>

          <!-- 选中文档元信息卡片 -->
          <div v-if="activeDoc" class="active-doc-preview-card">
            <div class="doc-card-head">
              <FileText :size="15" class="doc-icon" />
              <span class="doc-name" :title="activeDoc.originalName">{{ activeDoc.originalName }}</span>
              <button
                type="button"
                class="doc-del-btn"
                title="删除文档"
                :disabled="isGenerating"
                @click="handleDeleteDoc(activeDoc.id)"
              >
                <Trash2 :size="13" />
              </button>
            </div>
            <div class="doc-card-meta">
              <span>大小: {{ Math.round(activeDoc.sizeBytes / 1024) }} KB</span>
              <span>字符数: {{ activeDoc.charCount.toLocaleString() }}</span>
            </div>
            <div class="doc-card-summary">
              {{ activeDoc.summary }}
            </div>
          </div>
          <div v-else class="empty-doc-hint">
            暂未选择文档，AI 将直接根据您的提示词主题进行策划出题。
          </div>
        </div>

        <!-- 2. 智造约束与参数 -->
        <div class="panel-section">
          <div class="section-title-line">
            <span class="section-title">2. 调研诉求与题目约束</span>
          </div>

          <!-- 提示词输入 -->
          <div class="form-item-block">
            <label class="item-label">核心考察方向 / 调研目的</label>
            <NInput
              v-model:value="userPrompt"
              type="textarea"
              :rows="3"
              placeholder="描述您的问卷调研诉求..."
              :disabled="isGenerating"
              class="prompt-textarea"
            />
          </div>

          <!-- 快速预设标签 -->
          <div class="quick-preset-chips">
            <span class="preset-label">快捷灵感:</span>
            <button
              type="button"
              class="preset-chip"
              @click="setPromptQuick('全面评估团队在微服务演进、CI/CD自动化与自动化测试中的真实卡点')"
            >
              微服务与CI/CD
            </button>
            <button
              type="button"
              class="preset-chip"
              @click="setPromptQuick('量化AI编程辅助工具在代码交付与工程心流中的采纳率与真实ROI')"
            >
              AI编码采纳与ROI
            </button>
            <button
              type="button"
              class="preset-chip"
              @click="setPromptQuick('调研开发者在本地环境启动、文档维护与跨团队联调中的最痛体验')"
            >
              开发者痛点调研
            </button>
          </div>

          <!-- 题量滑块 -->
          <div class="form-item-block" style="margin-top: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="item-label">计划题目数量: <strong>{{ targetCount }} 题</strong></label>
            </div>
            <NSlider
              v-model:value="targetCount"
              :min="4"
              :max="20"
              :step="1"
              :disabled="isGenerating"
            />
          </div>

          <!-- 条件跳转开关 -->
          <div class="switch-row">
            <div>
              <div class="switch-title">编织条件跳转与算式 (Jump & Set)</div>
              <div class="switch-desc">在第 1 题植入受众甄别，并在中后段植入得分算式</div>
            </div>
            <NSwitch v-model:value="enableJumpLogic" :disabled="isGenerating" />
          </div>
        </div>

        <!-- 启动按键 -->
        <button
          type="button"
          class="start-pipeline-btn"
          :disabled="isGenerating || isUploading"
          @click="startPipeline"
        >
          <Sparkles v-if="!isGenerating" :size="17" />
          <RefreshCw v-else :size="17" class="spinning" />
          <span>{{ isGenerating ? '智能体流水线装配中...' : '开始四阶渐进式智造' }}</span>
        </button>
      </section>

      <!-- 右侧：四阶流水线装配可视化看板 -->
      <section class="right-assembly-stage">
        <!-- 阶段步进指示器 -->
        <div class="stepper-bar">
          <div class="step-pill" :class="{ 'is-active': currentStage === 'planning', 'is-done': currentStage !== 'idle' && currentStage !== 'planning' }">
            <span class="step-dot">1</span>
            <span class="step-txt">架构策划</span>
          </div>
          <div class="step-connector">➔</div>
          <div class="step-pill" :class="{ 'is-active': currentStage === 'drafting', 'is-done': currentStage === 'weaving' || currentStage === 'auditing' || currentStage === 'completed' }">
            <span class="step-dot">2</span>
            <span class="step-txt">分面出题</span>
          </div>
          <div class="step-connector">➔</div>
          <div class="step-pill" :class="{ 'is-active': currentStage === 'weaving', 'is-done': currentStage === 'auditing' || currentStage === 'completed' }">
            <span class="step-dot">3</span>
            <span class="step-txt">跳转编织</span>
          </div>
          <div class="step-connector">➔</div>
          <div class="step-pill" :class="{ 'is-active': currentStage === 'auditing', 'is-done': currentStage === 'completed' }">
            <span class="step-dot">4</span>
            <span class="step-txt">拓扑审计</span>
          </div>
        </div>

        <!-- 实时状态日志栏 -->
        <div class="status-banner" :class="{ 'is-running': isGenerating, 'is-complete': currentStage === 'completed', 'is-error': !!errorMessage }">
          <div class="pulse-indicator" v-if="isGenerating"></div>
          <CheckCircle2 v-else-if="currentStage === 'completed'" :size="16" class="success-icon" />
          <AlertCircle v-else-if="errorMessage" :size="16" class="error-icon" />
          <Cpu v-else :size="16" />
          <span class="banner-text">{{ errorMessage || stageMessage || '等待启动流水线...' }}</span>
        </div>

        <!-- 蓝图成果卡片 (Stage 1 产物) -->
        <div v-if="blueprint" class="blueprint-summary-box">
          <div class="blueprint-head">
            <span class="bp-badge">策划蓝图</span>
            <span class="bp-title">{{ blueprint.title }}</span>
          </div>
          <div class="bp-dimensions">
            <span class="dim-chip" v-for="(dim, idx) in blueprint.dimensions" :key="idx">
              {{ dim.name }} ({{ dim.questionCount }}题)
            </span>
            <span class="dim-chip variable-chip" v-for="(v, vidx) in blueprint.variables" :key="'v'+vidx">
              ⚡ {{ v.name }}: {{ v.description }}
            </span>
          </div>
        </div>

        <!-- 流式题目卡片装配流水线 (Stage 2 & 3 产物) -->
        <div ref="questionStreamContainerRef" class="questions-stream-box">
          <div v-if="streamedQuestions.length === 0 && !isGenerating" class="empty-stream-placeholder">
            <div class="ph-icon">🧩</div>
            <p>启动智造后，题目将在此处实时以卡片弹簧动效依次流式装配就位。</p>
          </div>

          <div
            v-for="(q, qidx) in streamedQuestions"
            :key="q.id + qidx"
            class="streamed-question-card"
          >
            <div class="sq-head">
              <div class="sq-id-badge">{{ q.id.toUpperCase() }}</div>
              <div class="sq-type-tag">{{ q.type }}</div>
              <div class="sq-title">{{ q.title }}</div>
            </div>

            <!-- 选项预览 -->
            <div v-if="q.options && q.options.length > 0" class="sq-options-grid">
              <div v-for="(opt, oidx) in q.options" :key="oidx" class="sq-option-chip">
                <span class="opt-idx">{{ String.fromCharCode(65 + oidx) }}</span>
                <span class="opt-label">{{ typeof opt === 'string' ? opt : opt.label }}</span>
              </div>
            </div>

            <!-- 跳转逻辑与算式徽标 (Stage 3 注入成果) -->
            <div v-if="q.jump || q.set" class="sq-logic-footer">
              <span v-if="q.set" class="logic-tag set-tag">
                📐 set: {{ JSON.stringify(q.set) }}
              </span>
              <span v-if="q.jump" class="logic-tag jump-tag">
                ⚡ jump: {{ typeof q.jump === 'string' ? q.jump : `${q.jump.length} 分支` }}
              </span>
            </div>
          </div>
        </div>

        <!-- 阶段 4 审计成果 -->
        <div v-if="auditLogs.length > 0" class="audit-log-strip">
          <div v-for="(log, lidx) in auditLogs" :key="lidx" class="audit-log-line">
            {{ log }}
          </div>
        </div>

        <!-- 完成操作栏 -->
        <div v-if="persistedInfo" class="completed-actions-bar">
          <div class="action-info">
            🎉 问卷已入库 (ID: <code>{{ persistedInfo.surveyId }}</code>)
          </div>
          <div class="action-buttons">
            <a :href="persistedInfo.accessUrl" target="_blank" class="action-btn-primary">
              <span>受访端作答体验</span>
              <ExternalLink :size="14" />
            </a>
            <a :href="persistedInfo.canvasUrl" target="_blank" class="action-btn-secondary">
              <span>拓扑幕布漫游</span>
              <Layers :size="14" />
            </a>
            <button type="button" class="action-btn-ghost" @click="emit('update:show', false)">
              <span>关闭并查看列表</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </NModal>
</template>

<style scoped>
.ai-studio-modal {
  border-radius: 20px;
  overflow: hidden;
}

.modal-header-custom {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ai-spark-badge {
  width: 38px;
  height: 38px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.modal-subtitle {
  font-size: 0.8rem;
  color: #64748b;
}

.studio-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  min-height: 580px;
}

/* 左侧配置面板 */
.left-config-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: #f8fafc;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #1e293b;
}

.hint-tag {
  font-size: 0.75rem;
  color: #64748b;
  background: #e2e8f0;
  padding: 2px 6px;
  border-radius: 4px;
}

.doc-selector-group {
  display: flex;
  gap: 8px;
}

.upload-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.16s ease;
}

.upload-trigger-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.active-doc-preview-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.doc-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-icon {
  color: #4f46e5;
  flex-shrink: 0;
}

.doc-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.doc-del-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
}

.doc-del-btn:hover {
  color: #ef4444;
}

.doc-card-meta {
  display: flex;
  gap: 12px;
  font-size: 0.75rem;
  color: #64748b;
}

.doc-card-summary {
  font-size: 0.78rem;
  color: #475569;
  line-height: 1.4;
  background: #f8fafc;
  padding: 6px 8px;
  border-radius: 6px;
  max-height: 60px;
  overflow: hidden;
}

.empty-doc-hint {
  font-size: 0.8rem;
  color: #94a3b8;
  line-height: 1.4;
  padding: 10px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  text-align: center;
}

.item-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
  display: block;
  margin-bottom: 6px;
}

.quick-preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
}

.preset-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.preset-chip {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 3px 8px;
  font-size: 0.75rem;
  color: #4f46e5;
  cursor: pointer;
  transition: all 0.14s ease;
}

.preset-chip:hover {
  background: #eef2ff;
  border-color: #c7d2fe;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding: 10px 12px;
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.switch-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #1e293b;
}

.switch-desc {
  font-size: 0.72rem;
  color: #64748b;
}

.start-pipeline-btn {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  padding: 14px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  transition: all 0.16s ease;
}

.start-pipeline-btn:hover:not(:disabled) {
  transform: translateY(-1.5px);
  box-shadow: 0 6px 18px rgba(79, 70, 229, 0.4);
}

.start-pipeline-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

/* 右侧装配看板 */
.right-assembly-stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stepper-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f1f5f9;
  padding: 8px 14px;
  border-radius: 12px;
}

.step-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.5;
  transition: all 0.2s ease;
}

.step-pill.is-active {
  opacity: 1;
  color: #4f46e5;
  font-weight: 700;
}

.step-pill.is-done {
  opacity: 0.9;
  color: #059669;
}

.step-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #cbd5e1;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}

.step-pill.is-active .step-dot {
  background: #4f46e5;
}

.step-pill.is-done .step-dot {
  background: #10b981;
}

.step-txt {
  font-size: 0.82rem;
}

.step-connector {
  color: #cbd5e1;
  font-size: 0.8rem;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.85rem;
  color: #475569;
}

.status-banner.is-running {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #4338ca;
}

.status-banner.is-complete {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}

.status-banner.is-error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}

.pulse-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6366f1;
  animation: pulse 1.2s infinite;
}

.blueprint-summary-box {
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blueprint-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bp-badge {
  background: #e0e7ff;
  color: #4338ca;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.bp-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.bp-dimensions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dim-chip {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.75rem;
  color: #334155;
}

.variable-chip {
  background: #fdf4ff;
  border-color: #f5d0fe;
  color: #86198f;
}

.questions-stream-box {
  flex: 1;
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.empty-stream-placeholder {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 0.88rem;
  text-align: center;
  padding: 40px;
}

.ph-icon {
  font-size: 32px;
  margin-bottom: 10px;
}

.streamed-question-card {
  background: #ffffff;
  border: 1.5px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.sq-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sq-id-badge {
  font-size: 0.75rem;
  font-weight: 800;
  color: #4f46e5;
  background: #eef2ff;
  padding: 2px 6px;
  border-radius: 4px;
}

.sq-type-tag {
  font-size: 0.72rem;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}

.sq-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: #0f172a;
}

.sq-options-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sq-option-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.78rem;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 4px;
}

.opt-idx {
  font-weight: 700;
  color: #6366f1;
}

.sq-logic-footer {
  display: flex;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed #f1f5f9;
}

.logic-tag {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.set-tag {
  background: #fef3c7;
  color: #92400e;
}

.jump-tag {
  background: #ede9fe;
  color: #5b21b6;
}

.audit-log-strip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.75rem;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.completed-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ecfdf5;
  border: 1.5px solid #a7f3d0;
  border-radius: 12px;
  padding: 12px 18px;
}

.action-info {
  font-size: 0.88rem;
  font-weight: 600;
  color: #065f46;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.action-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #059669;
  color: #ffffff;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}

.action-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  color: #065f46;
  border: 1px solid #a7f3d0;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}

.action-btn-ghost {
  background: transparent;
  border: none;
  color: #065f46;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}

@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
