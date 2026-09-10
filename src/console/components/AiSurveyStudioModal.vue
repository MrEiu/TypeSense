<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, onUnmounted } from 'vue';
import {
  NModal,
  NButton,
  NInput,
  NSlider,
  NSwitch,
  NSelect,
  NSpin,
  NTag,
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
  Play,
  Pause,
  MessageSquare,
  Compass,
  Check,
  Zap,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Brain,
  Clock,
} from 'lucide-vue-next';
import {
  AiGeneratorClientService,
  type DocumentItem,
  type SurveyBlockItem,
  type SurveyBlueprintItem,
  type LogicTemplateItem,
} from '../../services/ai-generator-client-service';
import type { QuestionnaireModel, QuestionItemModel } from '../../schema/questionnaire-schema-types';
import SurveyFlowCanvas from '../../canvas/components/SurveyFlowCanvas.vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'created'): void;
}>();

// 知识库与基础输入配置
const documents = ref<DocumentItem[]>([]);
const selectedDocId = ref<string | null>(null);
const isUploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const userPrompt = ref('');
const targetCount = ref(8);
const enableJumpLogic = ref(true);

// 动态逻辑模板配置 (来自 data/logic-templates，支持多选组合)
const logicTemplates = ref<LogicTemplateItem[]>([]);
const selectedTemplateIds = ref<string[]>([]);

const templateOptions = computed(() => {
  return logicTemplates.value.map((t) => ({
    label: `${t.name}`,
    value: t.id,
  }));
});

const activeTemplates = computed(() => {
  if (!selectedTemplateIds.value || selectedTemplateIds.value.length === 0) return [];
  return logicTemplates.value.filter((t) => selectedTemplateIds.value.includes(t.id));
});

// 组块化人机协同核心状态
export interface InteractiveBlock extends SurveyBlockItem {
  status: 'pending' | 'generating' | 'completed';
  questions: QuestionItemModel[];
  steerPrompt?: string;
}

const blueprint = ref<SurveyBlueprintItem | null>(null);
const blocks = ref<InteractiveBlock[]>([]);
const currentBlockIndex = ref<number>(0);

// 极速直出全卷实体
const directSurvey = ref<QuestionnaireModel | null>(null);
const isDirectGenerating = ref(false);

// AI 思考链与实时题目生成流式状态
const thoughtContent = ref('');
const isThinkingExpanded = ref(true);
const thoughtDurationSec = ref(0);
const isThinkingFinished = ref(false);
const thoughtScrollRef = ref<HTMLDivElement | null>(null);
const draftedQuestions = ref<QuestionItemModel[]>([]);
let thoughtTimer: any = null;

function startThoughtTimer() {
  stopThoughtTimer();
  thoughtDurationSec.value = 0;
  isThinkingFinished.value = false;
  thoughtTimer = setInterval(() => {
    thoughtDurationSec.value += 1;
  }, 1000);
}

function stopThoughtTimer() {
  if (thoughtTimer) {
    clearInterval(thoughtTimer);
    thoughtTimer = null;
  }
}

const isPlanning = ref(false);
const isGeneratingChunk = ref(false);
const isAutoRunning = ref(false);
const shouldPauseAuto = ref(false);

const statusMessage = ref('');
const errorMessage = ref<string | null>(null);

// 人工干涉指令相关
const showInterventionInput = ref(false);
const refineInstruction = ref('');

// 发布成果状态
const persistedInfo = ref<{ surveyId: string; accessUrl: string; canvasUrl: string } | null>(null);

// 响应式全景问卷领域模型
const activeSurveyData = computed<QuestionnaireModel>(() => {
  if (directSurvey.value) {
    return directSurvey.value;
  }
  return {
    id: 'ai_studio_active_dag',
    title: blueprint.value?.title || 'AI 全景蓝图拓扑幕布',
    description: blueprint.value?.description || userPrompt.value || '正在动态生成中...',
    questions: allQuestions.value,
  };
});

const activeDoc = computed(() => {
  return documents.value.find((d) => d.id === selectedDocId.value) || null;
});

const docOptions = computed(() => {
  return documents.value.map((d) => ({
    label: `${d.originalName} (${d.charCount.toLocaleString()} 字)`,
    value: d.id,
  }));
});

// 计算所有已确认就绪的题目列表
const allQuestions = computed(() => {
  const list: QuestionItemModel[] = [];
  for (const b of blocks.value) {
    list.push(...b.questions);
  }
  return list;
});

// 计算当前待生成的组块骨架（传递给画布进行拓扑渲染）
const pendingBlocksForCanvas = computed(() => {
  if (directSurvey.value) return [];
  return blocks.value
    .filter((b) => b.status === 'pending' || b.status === 'generating')
    .map((b) => ({
      id: b.id,
      name: b.name,
      questionCount: b.questionCount,
      description: b.description,
    }));
});

// 当前活动的题组块
const currentBlock = computed<InteractiveBlock | null>(() => {
  if (blocks.value.length === 0) return null;
  return blocks.value[currentBlockIndex.value] || null;
});

// 是否所有组块均已生成完毕
const isAllBlocksCompleted = computed(() => {
  return blocks.value.length > 0 && blocks.value.every((b) => b.status === 'completed');
});

/**
 * 同步更新拓扑状态
 */
async function syncCanvas(): Promise<void> {
  await nextTick();
}

// 加载文档与逻辑模板列表
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
  } catch (err: any) {
    alert(`文件上传失败: ${err.message}`);
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

/**
 * 极简极速直出一键生成问卷 (Direct Lean Survey Generation - SSE 流式驱动)
 */
async function handleDirectGenerate() {
  if (!userPrompt.value.trim() && !selectedDocId.value) {
    errorMessage.value = '请先输入调研诉求或选择知识文档';
    return;
  }

  isDirectGenerating.value = true;
  errorMessage.value = null;
  statusMessage.value = '正在基于极简契约启动 AI 深度思考与问卷拓扑推演...';
  persistedInfo.value = null;
  blueprint.value = null;
  directSurvey.value = null;
  blocks.value = [];
  thoughtContent.value = '';
  draftedQuestions.value = [];
  isThinkingExpanded.value = true;
  startThoughtTimer();

  try {
    await AiGeneratorClientService.startGenerationStream(
      {
        prompt: userPrompt.value,
        documentId: selectedDocId.value || undefined,
        templateIds: selectedTemplateIds.value.length > 0 ? selectedTemplateIds.value : undefined,
        targetCount: targetCount.value,
        enableJumpLogic: enableJumpLogic.value,
      },
      (event) => {
        if (event.type === 'thought_chunk' && event.delta) {
          thoughtContent.value += event.delta;
          nextTick(() => {
            if (thoughtScrollRef.value) {
              thoughtScrollRef.value.scrollTop = thoughtScrollRef.value.scrollHeight;
            }
          });
        } else if (event.type === 'stage_start') {
          statusMessage.value = event.message || '正在推演问卷架构与题目流向...';
        } else if (event.type === 'question_drafted' && event.question) {
          isThinkingFinished.value = true;
          stopThoughtTimer();
          draftedQuestions.value.push(event.question);
          statusMessage.value = `正在实时生成题目 (${event.index || draftedQuestions.value.length}/${event.total || targetCount.value}): ${event.question.title}`;
        } else if (event.type === 'completed' && event.survey) {
          isThinkingFinished.value = true;
          stopThoughtTimer();
          directSurvey.value = event.survey;
          statusMessage.value = `🎉 问卷已极速推演完毕！共生成 ${event.survey.questions.length} 道题目拓扑。`;
          syncCanvas();
        } else if (event.type === 'persisted') {
          persistedInfo.value = {
            surveyId: event.surveyId || '',
            accessUrl: event.accessUrl || '',
            canvasUrl: event.canvasUrl || '',
          };
        } else if (event.type === 'error') {
          isThinkingFinished.value = true;
          stopThoughtTimer();
          errorMessage.value = event.error || '生成问卷失败';
        }
      }
    );
  } catch (err: any) {
    isThinkingFinished.value = true;
    stopThoughtTimer();
    errorMessage.value = err?.message || '生成问卷失败';
  } finally {
    isDirectGenerating.value = false;
    stopThoughtTimer();
  }
}

/**
 * Stage 1: 规划问卷架构与题组块并在无限画布上呈现全景骨架
 */
async function handlePlanBlueprint() {
  if (!userPrompt.value.trim() && !selectedDocId.value) {
    errorMessage.value = '请先输入调研诉求或选择知识文档';
    return;
  }

  isPlanning.value = true;
  errorMessage.value = null;
  statusMessage.value = '正在深入推导调研脉络，在无限幕布上规划全景拓扑骨架...';
  persistedInfo.value = null;
  directSurvey.value = null;

  try {
    const result = await AiGeneratorClientService.planBlueprint({
      prompt: userPrompt.value,
      documentId: selectedDocId.value || undefined,
      templateIds: selectedTemplateIds.value.length > 0 ? selectedTemplateIds.value : undefined,
      targetCount: targetCount.value,
    });

    blueprint.value = result;
    const rawBlocks = result.blocks || result.dimensions || [];

    blocks.value = rawBlocks.map((b) => ({
      ...b,
      status: 'pending',
      questions: [],
    }));

    currentBlockIndex.value = 0;
    statusMessage.value = `全景蓝图规划完毕！已在无限画布就位 ${blocks.value.length} 个递进题组块。`;

    await nextTick();
    await syncCanvas();
  } catch (err: any) {
    errorMessage.value = err?.message || '全景蓝图规划失败';
  } finally {
    isPlanning.value = false;
  }
}

/**
 * Stage 2: 生成单个指定的题组块 (极速 2~4 秒出题并动态展开画布)
 */
async function handleGenerateSingleBlock(blockIndex: number, customRefine?: string): Promise<boolean> {
  if (!blueprint.value) return false;
  const targetBlock = blocks.value[blockIndex];
  if (!targetBlock) return false;

  isGeneratingChunk.value = true;
  targetBlock.status = 'generating';
  statusMessage.value = `正在为【${targetBlock.name}】动态出题与生成跳转流向 (计划 ${targetBlock.questionCount} 题)...`;
  errorMessage.value = null;

  // 收集当前组块之前的已确认题目
  const precedingQuestions: QuestionItemModel[] = [];
  for (let i = 0; i < blockIndex; i++) {
    precedingQuestions.push(...blocks.value[i].questions);
  }

  try {
    const generated = await AiGeneratorClientService.generateChunk({
      blueprint: blueprint.value,
      block: targetBlock,
      existingQuestions: precedingQuestions,
      enableJumpLogic: enableJumpLogic.value,
      refinePrompt: customRefine || targetBlock.steerPrompt,
      documentId: selectedDocId.value || undefined,
      templateIds: selectedTemplateIds.value.length > 0 ? selectedTemplateIds.value : undefined,
    });

    targetBlock.questions = generated;
    targetBlock.status = 'completed';

    statusMessage.value = `【${targetBlock.name}】已成功生成 ${generated.length} 题并在画布裂变就位！`;
    showInterventionInput.value = false;
    refineInstruction.value = '';

    await syncCanvas();
    return true;
  } catch (err: any) {
    targetBlock.status = 'pending';
    errorMessage.value = `组块【${targetBlock.name}】出题失败: ${err?.message || '模型响应异常'}`;
    return false;
  } finally {
    isGeneratingChunk.value = false;
  }
}

/**
 * 确认当前组块并推进到下一组块
 */
async function handleConfirmAndNext() {
  if (currentBlockIndex.value < blocks.value.length - 1) {
    currentBlockIndex.value++;
    const nextBlock = blocks.value[currentBlockIndex.value];
    if (nextBlock && nextBlock.status === 'pending') {
      await handleGenerateSingleBlock(currentBlockIndex.value);
    }
  }
}

/**
 * 对当前组块输入干预意见并重新拟定
 */
async function handleRegenerateCurrentBlock() {
  if (!refineInstruction.value.trim()) return;
  const targetBlock = currentBlock.value;
  if (!targetBlock) return;

  targetBlock.steerPrompt = refineInstruction.value.trim();
  await handleGenerateSingleBlock(currentBlockIndex.value, targetBlock.steerPrompt);
}

/**
 * 连续并发推进全部剩余组块 (支持随时暂停，最大并发 3)
 */
async function handleStartAutoPlay() {
  if (isAutoRunning.value) {
    shouldPauseAuto.value = true;
    isAutoRunning.value = false;
    statusMessage.value = '并发流水线已暂停，您可以对当前画布卡片进行人工干涉。';
    return;
  }

  isAutoRunning.value = true;
  shouldPauseAuto.value = false;
  statusMessage.value = '正在多 Agent 并发生成各组块题目...';

  const pendingIndices = blocks.value
    .map((b, idx) => ({ idx, status: b.status }))
    .filter((b) => b.status !== 'completed')
    .map((b) => b.idx);

  const concurrency = 3;
  let queuePos = 0;

  const workers = Array.from({ length: Math.min(concurrency, pendingIndices.length) }, async () => {
    while (queuePos < pendingIndices.length) {
      if (shouldPauseAuto.value) break;
      const targetIdx = pendingIndices[queuePos++];
      await handleGenerateSingleBlock(targetIdx);
    }
  });

  await Promise.all(workers);

  isAutoRunning.value = false;
  shouldPauseAuto.value = false;
  statusMessage.value = '所有题组块已并发生成完毕，可点击右下方发布问卷！';
}

/**
 * Stage 3: 发布问卷并入库
 */
async function handleFinalizeSurvey() {
  const currentTitle = directSurvey.value?.title || blueprint.value?.title || 'AI 智造问卷';
  const currentDesc = directSurvey.value?.description || blueprint.value?.description || '基于极简契约生成。';
  const currentQs = directSurvey.value?.questions || allQuestions.value;

  if (!currentQs || currentQs.length === 0) return;

  statusMessage.value = '正在校验全卷有向图无环拓扑并保存入库...';
  try {
    const result = await AiGeneratorClientService.finalizeSurvey({
      title: currentTitle,
      description: currentDesc,
      questions: currentQs,
    });

    persistedInfo.value = {
      surveyId: result.surveyId,
      accessUrl: result.accessUrl,
      canvasUrl: result.canvasUrl,
    };

    statusMessage.value = `🎉 问卷已正式入库并生成拓扑！ID: ${result.surveyId}`;
    emit('created');
  } catch (err: any) {
    errorMessage.value = `发布问卷失败: ${err?.message || '存储异常'}`;
  }
}

/**
 * 重置工坊全量状态，开启全新智造
 */
function resetStudioState() {
  userPrompt.value = '';
  selectedDocId.value = null;
  selectedTemplateIds.value = [];
  directSurvey.value = null;
  isDirectGenerating.value = false;
  blueprint.value = null;
  blocks.value = [];
  currentBlockIndex.value = 0;
  isPlanning.value = false;
  isGeneratingChunk.value = false;
  isAutoRunning.value = false;
  shouldPauseAuto.value = false;
  statusMessage.value = '';
  errorMessage.value = null;
  showInterventionInput.value = false;
  refineInstruction.value = '';
  persistedInfo.value = null;
  thoughtContent.value = '';
  draftedQuestions.value = [];
  thoughtDurationSec.value = 0;
  isThinkingFinished.value = false;
  stopThoughtTimer();
}

function handleCloseModal() {
  if (persistedInfo.value) {
    resetStudioState();
  }
  emit('update:show', false);
}

// 监听弹窗显隐生命周期：如果上次已完成入库，关闭或再次打开时自动重置为全新状态
watch(
  () => props.show,
  (val) => {
    if (val) {
      loadDocuments();
      loadLogicTemplates();
      if (persistedInfo.value) {
        resetStudioState();
      }
    } else {
      isAutoRunning.value = false;
      shouldPauseAuto.value = true;
      stopThoughtTimer();
      if (persistedInfo.value) {
        resetStudioState();
      }
    }
  }
);

onUnmounted(() => {
  stopThoughtTimer();
});

onMounted(() => {
  loadDocuments();
  loadLogicTemplates();
});
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="ai-studio-modal"
    :mask-closable="!isPlanning && !isGeneratingChunk && !isAutoRunning"
    :closable="!isPlanning && !isGeneratingChunk && !isAutoRunning"
    style="width: 96vw; max-width: 1680px; height: 92vh; max-height: 980px;"
    @update:show="emit('update:show', $event)"
  >
    <template #header>
      <div class="modal-header-custom">
        <div class="ai-spark-badge">
          <Sparkles :size="20" class="spark-icon" />
        </div>
        <div class="header-titles">
          <div class="title-row">
            <h2 class="modal-title">AI 问卷智造工坊 (Canvas-Native Agentic Studio)</h2>
            <span class="version-tag">组块智造 · 无限幕布拓扑 · 人机干涉</span>
          </div>
          <span class="modal-subtitle">
            基于工业级极简契约，以多题组块为单元动态生成，在自组织无限幕布上实时裂变呈现有向图拓扑。
          </span>
        </div>

        <div v-if="blueprint || directSurvey || userPrompt" class="header-extra-actions">
          <button
            type="button"
            class="header-reset-btn"
            title="清空当前问卷草稿，开启新问卷"
            :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating"
            @click="resetStudioState"
          >
            <RotateCcw :size="13" />
            <span>开启新智造</span>
          </button>
        </div>
      </div>
    </template>

    <div class="studio-workspace-layout">
      <!-- 左侧控制台 (340px) -->
      <aside class="left-control-sidebar">
        <!-- 1. 文档知识库 -->
        <div class="control-box">
          <div class="box-title-row">
            <span class="box-title">1. 文档知识上下文</span>
            <span class="box-tag">PDF / DOCX / MD</span>
          </div>

          <div class="doc-select-line">
            <NSelect
              v-model:value="selectedDocId"
              :options="docOptions"
              placeholder="从知识库选择已有文档..."
              :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating"
              size="small"
              class="sidebar-select"
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
              class="doc-upload-icon-btn"
              title="上传新文档"
              :disabled="isPlanning || isGeneratingChunk || isUploading || isDirectGenerating"
              @click="triggerFileSelect"
            >
              <UploadCloud :size="14" />
            </button>
          </div>

          <div v-if="activeDoc" class="active-doc-mini-card">
            <div class="doc-name-line">
              <FileText :size="13" class="doc-icon" />
              <span class="doc-name" :title="activeDoc.originalName">{{ activeDoc.originalName }}</span>
              <button type="button" class="doc-del-btn" @click="handleDeleteDoc(activeDoc.id)">
                <Trash2 :size="12" />
              </button>
            </div>
            <div class="doc-meta-text">{{ activeDoc.charCount.toLocaleString() }} 字符 · {{ activeDoc.summary?.slice(0, 48) }}...</div>
          </div>
        </div>

        <!-- 2. 调研诉求与出题约束 -->
        <div class="control-box">
          <div class="box-title-row">
            <span class="box-title">2. 调研诉求与规模</span>
          </div>

          <div class="field-item">
            <label class="field-label">核心考察主题 / 提示词</label>
            <NInput
              v-model:value="userPrompt"
              type="textarea"
              :rows="3"
              placeholder="输入调研诉求，如：员工离职倾向与团队满意度、新零售消费体验..."
              :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating"
              size="small"
            />
          </div>

          <div class="field-item">
            <div class="label-with-val">
              <label class="field-label">目标题目总数</label>
              <span class="val-pill">{{ targetCount }} 题</span>
            </div>
            <NSlider
              v-model:value="targetCount"
              :min="3"
              :max="80"
              :step="1"
              :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating"
            />
          </div>

          <!-- 逻辑流转范式模板参考 (动态从 data/logic-templates 发现，支持多选组合) -->
          <div class="field-item">
            <div class="label-with-val">
              <label class="field-label">逻辑流转模板参考 (支持多选)</label>
              <span v-if="activeTemplates.length > 0" class="val-pill template-pill">已选 {{ activeTemplates.length }} 个</span>
            </div>
            <NSelect
              v-model:value="selectedTemplateIds"
              multiple
              :options="templateOptions"
              placeholder="选择流转拓扑模板 (可多选组合)..."
              :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating"
              size="small"
              clearable
              class="sidebar-select"
            />
            <div v-if="activeTemplates.length > 0" class="template-hint-list">
              <div v-for="tpl in activeTemplates" :key="tpl.id" class="template-hint-card">
                <div class="template-hint-name">{{ tpl.name }}</div>
                <div class="template-hint-desc">{{ tpl.description }}</div>
              </div>
            </div>
          </div>

          <div class="field-item switch-row">
            <label class="field-label">启用非线性条件跳转 (Jump)</label>
            <NSwitch
              v-model:value="enableJumpLogic"
              :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating"
              size="small"
            />
          </div>

          <!-- 双模式触发动作组 -->
          <div class="actions-stack">
            <button
              type="button"
              class="primary-action-btn direct-btn"
              :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating || (!userPrompt.trim() && !selectedDocId)"
              @click="handleDirectGenerate"
            >
              <Sparkles :size="16" class="spin-on-active" :class="{ 'anim-spin': isDirectGenerating }" />
              <span>{{ isDirectGenerating ? '正在极速直出全卷...' : '✨ AI 极速一键智造 (一步直出)' }}</span>
            </button>

            <button
              type="button"
              class="secondary-action-btn blueprint-btn"
              :disabled="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating || (!userPrompt.trim() && !selectedDocId)"
              @click="handlePlanBlueprint"
            >
              <Compass :size="14" class="spin-on-active" :class="{ 'anim-spin': isPlanning }" />
              <span>{{ isPlanning ? '正在规划题组块...' : '📐 规划题组分步干预' }}</span>
            </button>
          </div>
        </div>

        <!-- 3. 题组块流水线概览 (蓝图规划成功后展示) -->
        <div v-if="blocks.length > 0" class="control-box blocks-overview-box">
          <div class="box-title-row">
            <span class="box-title">3. 规划题组块 ({{ blocks.length }} 块)</span>
            <span class="box-tag">已就绪 {{ allQuestions.length }}/{{ targetCount }} 题</span>
          </div>

          <div class="blocks-step-list">
            <div
              v-for="(b, bIdx) in blocks"
              :key="b.id"
              class="block-step-item"
              :class="{
                'is-current': currentBlockIndex === bIdx,
                'is-done': b.status === 'completed',
                'is-generating': b.status === 'generating'
              }"
              @click="currentBlockIndex = bIdx"
            >
              <div class="step-num-circle">
                <Check v-if="b.status === 'completed'" :size="12" />
                <span v-else>{{ bIdx + 1 }}</span>
              </div>
              <div class="step-content">
                <div class="step-name">{{ b.name }}</div>
                <div class="step-desc">计划 {{ b.questionCount }} 题 · {{ b.questions.length ? `已出 ${b.questions.length} 题` : '待生成' }}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧主视界：自组织无限幕布原生容器与悬浮控制舱 -->
      <main class="right-canvas-stage">
        <!-- 当尚未规划蓝图且未直出且不在生成中的引导遮罩 -->
        <div v-if="!blueprint && !directSurvey && !isDirectGenerating && !thoughtContent" class="canvas-empty-guide">
          <div class="guide-sparkle-circle">
            <Compass :size="38" />
          </div>
          <h3>自组织无限幕布待命中</h3>
          <p>在左侧输入调研诉求并点击「AI 极速一键智造」，AI 将实时呈现深度推演思维链，并在幕布上呈现拓扑与流向。</p>
        </div>

        <!-- 实时 AI 深度思考推演悬浮卡片 (DeepSeek / ChatGPT 风格) -->
        <div v-if="thoughtContent" class="ai-thought-panel" :class="{ 'is-collapsed': !isThinkingExpanded }">
          <div class="thought-header" @click="isThinkingExpanded = !isThinkingExpanded">
            <div class="thought-title-group">
              <div class="thought-spark-icon" :class="{ 'pulsing': !isThinkingFinished }">
                <Brain :size="15" />
              </div>
              <span class="thought-title">AI 深度思考推演过程</span>
              <span class="thought-timer-pill" :class="{ 'is-active': !isThinkingFinished }">
                <Clock :size="11" />
                <span>{{ isThinkingFinished ? `思考完毕 (${thoughtDurationSec}s)` : `思考中 ${thoughtDurationSec}s...` }}</span>
              </span>
            </div>
            <div class="thought-toggle-btn">
              <ChevronUp v-if="isThinkingExpanded" :size="14" />
              <ChevronDown v-else :size="14" />
            </div>
          </div>

          <div v-show="isThinkingExpanded" ref="thoughtScrollRef" class="thought-body">
            <pre class="thought-text-stream">{{ thoughtContent }}</pre>
          </div>
        </div>

        <!-- 实时生成中的题目预览流 (直出生成中且已有题目流出时展示) -->
        <div v-if="isDirectGenerating && draftedQuestions.length > 0 && !directSurvey" class="live-draft-stream-overlay">
          <div class="live-draft-header">
            <Sparkles :size="14" class="anim-spin" />
            <span>正在实时拟定题目拓扑 (已生成 {{ draftedQuestions.length }} 道)...</span>
          </div>
          <div class="live-draft-grid">
            <div v-for="(q, qIdx) in draftedQuestions" :key="q.id" class="live-draft-card">
              <div class="live-card-top">
                <span class="live-card-idx">#{{ qIdx + 1 }}</span>
                <span class="live-card-badge">{{ q.type }}</span>
                <span v-if="q.jump" class="live-card-jump-badge">Jump</span>
              </div>
              <div class="live-card-title">{{ q.title }}</div>
              <div v-if="q.options && q.options.length" class="live-card-opts">
                {{ q.options.length }} 个选项 ({{ q.options.slice(0, 2).join(' / ') }}{{ q.options.length > 2 ? '...' : '' }})
              </div>
            </div>
          </div>
        </div>

        <!-- 核心视口：基于 Vue Flow 的全景响应式画布 -->
        <div v-show="blueprint || directSurvey" class="studio-infinite-canvas-host">
          <SurveyFlowCanvas
            v-if="blueprint || directSurvey"
            :questionnaire="activeSurveyData"
            :pending-blocks="pendingBlocksForCanvas"
          />
        </div>

        <!-- 顶部悬浮控制舱 (Floating Agent Cockpit) -->
        <div v-if="blueprint || directSurvey" class="floating-cockpit">
          <!-- 状态通知胶囊 -->
          <div class="cockpit-bar">
            <div class="cockpit-left-status">
              <div v-if="isPlanning || isGeneratingChunk || isAutoRunning || isDirectGenerating" class="pulse-indicator-live"></div>
              <CheckCircle2 v-else-if="directSurvey || isAllBlocksCompleted" :size="16" class="success-icon" />
              <Cpu v-else :size="16" />
              <span class="status-live-text">{{ errorMessage || statusMessage }}</span>
            </div>

            <!-- 动态干预与推进按钮群 -->
            <div class="cockpit-actions">
              <!-- 直出模式操作 -->
              <template v-if="directSurvey">
                <button
                  type="button"
                  class="cockpit-btn btn-intervene"
                  :disabled="isDirectGenerating"
                  @click="handleDirectGenerate"
                >
                  <RefreshCw :size="14" :class="{ 'anim-spin': isDirectGenerating }" />
                  <span>重新生成</span>
                </button>
                <button
                  v-if="!persistedInfo"
                  type="button"
                  class="cockpit-btn btn-publish"
                  :disabled="isDirectGenerating"
                  @click="handleFinalizeSurvey"
                >
                  <Sparkles :size="14" />
                  <span>🎉 确认全卷并入库</span>
                </button>
              </template>

              <!-- 蓝图组块模式操作 -->
              <template v-else-if="blueprint">
                <!-- 人工干预修改意见按钮 -->
                <button
                  v-if="currentBlock && currentBlock.status === 'completed'"
                  type="button"
                  class="cockpit-btn btn-intervene"
                  :disabled="isGeneratingChunk || isAutoRunning"
                  @click="showInterventionInput = !showInterventionInput"
                >
                  <MessageSquare :size="14" />
                  <span>{{ showInterventionInput ? '收起干预' : '💬 提出干预重拟本块' }}</span>
                </button>

                <!-- 生成当前组块 -->
                <button
                  v-if="currentBlock && currentBlock.status === 'pending'"
                  type="button"
                  class="cockpit-btn btn-primary"
                  :disabled="isGeneratingChunk || isAutoRunning"
                  @click="handleGenerateSingleBlock(currentBlockIndex)"
                >
                  <Zap :size="14" />
                  <span>⚡ 生成当前组块 ({{ currentBlock.name }})</span>
                </button>

                <!-- 确认并生成下一块 -->
                <button
                  v-if="currentBlock && currentBlock.status === 'completed' && !isAllBlocksCompleted"
                  type="button"
                  class="cockpit-btn btn-accent"
                  :disabled="isGeneratingChunk || isAutoRunning"
                  @click="handleConfirmAndNext"
                >
                  <span>推进下一块 ➔</span>
                </button>

                <!-- 连续自动流式推进 / 暂停 -->
                <button
                  v-if="!isAllBlocksCompleted"
                  type="button"
                  class="cockpit-btn btn-autoplay"
                  :class="{ 'is-running': isAutoRunning }"
                  :disabled="isPlanning"
                  @click="handleStartAutoPlay"
                >
                  <Pause v-if="isAutoRunning" :size="14" />
                  <Play v-else :size="14" />
                  <span>{{ isAutoRunning ? '⏸ 暂停自动流' : '▶️ 连续自动生成全部' }}</span>
                </button>

                <!-- 发布问卷 -->
                <button
                  v-if="isAllBlocksCompleted && !persistedInfo"
                  type="button"
                  class="cockpit-btn btn-publish"
                  @click="handleFinalizeSurvey"
                >
                  <Sparkles :size="14" />
                  <span>🎉 确认全卷并入库</span>
                </button>
              </template>
            </div>
          </div>

          <!-- 展开的人工干涉对话输入条 (Human-in-the-loop) -->
          <div v-if="showInterventionInput && currentBlock" class="cockpit-intervention-drawer">
            <div class="drawer-header">
              <span class="drawer-title">对【{{ currentBlock.name }}】提出干涉指示：</span>
              <span class="drawer-hint">AI 将结合已确认的前置题目与您的要求就地重拟出题</span>
            </div>
            <div class="drawer-input-row">
              <NInput
                v-model:value="refineInstruction"
                type="text"
                placeholder="例如：把第2题改成多选题；把量表改为5级满意度；追加一道考察工具偏好的题目..."
                size="small"
                class="intervene-input"
                @keydown.enter="handleRegenerateCurrentBlock"
              />
              <button
                type="button"
                class="intervene-submit-btn"
                :disabled="!refineInstruction.trim() || isGeneratingChunk"
                @click="handleRegenerateCurrentBlock"
              >
                <span>重新生成本块</span>
                <RefreshCw :size="13" :class="{ 'anim-spin': isGeneratingChunk }" />
              </button>
            </div>
          </div>
        </div>

        <!-- 成果发布成功浮层 -->
        <div v-if="persistedInfo" class="publish-success-overlay">
          <div class="success-card">
            <div class="card-badge">SUCCESS</div>
            <h3>🎉 问卷已成功发布入库！</h3>
            <p>已通过全局有向图防环校验，并建立访问短链与管理幕布。</p>
            <div class="links-row">
              <a :href="persistedInfo.accessUrl" target="_blank" class="link-btn primary-link">
                <span>↗ 打开受访端体验作答</span>
              </a>
              <a :href="persistedInfo.canvasUrl" target="_blank" class="link-btn secondary-link">
                <span>📐 进入正式管理幕布</span>
              </a>
              <button type="button" class="link-btn accent-link" @click="resetStudioState">
                <Sparkles :size="15" />
                <span>✨ 开启下一份全新问卷</span>
              </button>
              <button type="button" class="link-btn ghost-link" @click="handleCloseModal">
                <span>完成并关闭</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  </NModal>
</template>

<style scoped>
.ai-studio-modal {
  border-radius: 20px;
  overflow: hidden;
  background: #090e1a;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
}

:deep(.n-card__content) {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  height: 100%;
}

:deep(.n-card-header) {
  padding: 16px 24px !important;
  background: #0d1527;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header-custom {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ai-spark-badge {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.version-tag {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.35);
}

.modal-subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
}

/* 主工作台双栏布局 */
.studio-workspace-layout {
  display: flex;
  flex: 1;
  height: calc(92vh - 90px);
  min-height: 560px;
  background: #060911;
  overflow: hidden;
}

/* 左侧控制台 */
.left-control-sidebar {
  width: 340px;
  flex-shrink: 0;
  background: #0b1120;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  overflow-y: auto;
}

.control-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(255, 255, 255, 0.02);
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.box-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.box-title {
  font-size: 0.84rem;
  font-weight: 600;
  color: #e2e8f0;
}

.box-tag {
  font-size: 0.68rem;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.doc-select-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-select {
  flex: 1;
}

.doc-upload-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.doc-upload-icon-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.3);
  color: #fff;
}

.active-doc-mini-card {
  padding: 8px 10px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
}

.doc-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.doc-name {
  font-size: 0.8rem;
  color: #f1f5f9;
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-del-btn {
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
}

.doc-meta-text {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 4px;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.775rem;
  color: #94a3b8;
}

.label-with-val {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.val-pill {
  font-size: 0.75rem;
  font-weight: 700;
  color: #818cf8;
}

.switch-row {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.primary-action-btn {
  height: 40px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
  transition: all 0.2s ease;
  margin-top: 6px;
}

.primary-action-btn:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.primary-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.actions-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.actions-stack .primary-action-btn {
  margin-top: 0;
}

.secondary-action-btn {
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.secondary-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  border-color: rgba(99, 102, 241, 0.4);
}

.secondary-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 题组块导航卡片 */
.blocks-step-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.block-step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.2s;
}

.block-step-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.block-step-item.is-current {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
}

.block-step-item.is-done {
  border-color: rgba(16, 185, 129, 0.4);
}

.step-num-circle {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  color: #cbd5e1;
  font-weight: 700;
}

.block-step-item.is-done .step-num-circle {
  background: #10b981;
  color: #fff;
}

.block-step-item.is-current .step-num-circle {
  background: #6366f1;
  color: #fff;
}

.step-content {
  flex: 1;
  overflow: hidden;
}

.step-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-desc {
  font-size: 0.68rem;
  color: #94a3b8;
}

/* 右侧无限幕布舞台 */
.right-canvas-stage {
  flex: 1;
  position: relative;
  overflow: hidden;
  height: 100%;
}

.studio-infinite-canvas-host {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  background: #060911;
}

.canvas-empty-guide {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 460px;
  text-align: center;
  color: #94a3b8;
}

.guide-sparkle-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
}

.canvas-empty-guide h3 {
  font-size: 1.15rem;
  color: #f1f5f9;
  margin: 0;
}

.canvas-empty-guide p {
  font-size: 0.85rem;
  line-height: 1.6;
}

/* 顶部悬浮控制舱 */
.floating-cockpit {
  position: absolute;
  top: 18px;
  left: 20px;
  right: 20px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.cockpit-bar {
  pointer-events: auto;
  background: rgba(14, 20, 34, 0.88);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 8px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.cockpit-left-status {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #cbd5e1;
  font-size: 0.84rem;
}

.pulse-indicator-live {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #6366f1;
  box-shadow: 0 0 10px #6366f1;
  animation: pulse-live 1.2s infinite;
}

@keyframes pulse-live {
  0%, 100% { transform: scale(0.9); opacity: 0.5; }
  50% { transform: scale(1.4); opacity: 1; }
}

.success-icon {
  color: #10b981;
}

.cockpit-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cockpit-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #6366f1;
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}

.btn-accent {
  background: #3b82f6;
  color: #fff;
}
.btn-accent:hover:not(:disabled) {
  background: #2563eb;
}

.btn-intervene {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.btn-intervene:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.btn-autoplay {
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.4);
}
.btn-autoplay.is-running {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.4);
}

.btn-publish {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
}

/* 干预抽屉条 */
.cockpit-intervention-drawer {
  pointer-events: auto;
  background: rgba(14, 20, 34, 0.94);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #c7d2fe;
}

.drawer-hint {
  font-size: 0.72rem;
  color: #94a3b8;
}

.drawer-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.intervene-input {
  flex: 1;
}

.intervene-submit-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  background: #6366f1;
  color: #fff;
  border: none;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.intervene-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 成果发布浮层 */
.publish-success-overlay {
  position: absolute;
  inset: 0;
  background: rgba(6, 9, 17, 0.85);
  backdrop-filter: blur(10px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.success-card {
  background: #0f172a;
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 18px;
  padding: 32px;
  max-width: 520px;
  text-align: center;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.7);
}

.card-badge {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 2px 10px;
  border-radius: 20px;
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  display: inline-block;
  margin-bottom: 12px;
}

.success-card h3 {
  font-size: 1.3rem;
  color: #f8fafc;
  margin: 0 0 8px 0;
}

.success-card p {
  font-size: 0.88rem;
  color: #94a3b8;
  margin: 0 0 24px 0;
}

.links-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.link-btn {
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-link {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
}

.secondary-link {
  background: rgba(99, 102, 241, 0.2);
  color: #c7d2fe;
  border: 1px solid rgba(99, 102, 241, 0.35);
}

.ghost-link {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
}

.accent-link {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25));
  border: 1px solid rgba(168, 85, 247, 0.45);
  color: #e9d5ff;
}

.accent-link:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.4));
  color: #fff;
}

.header-extra-actions {
  margin-left: auto;
}

.header-reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.header-reset-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.45);
  color: #fff;
}

.template-pill {
  background: rgba(16, 185, 129, 0.15) !important;
  color: #34d399 !important;
  border: 1px solid rgba(16, 185, 129, 0.3) !important;
}

.template-hint-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  max-height: 180px;
  overflow-y: auto;
}

.template-hint-card {
  padding: 8px 10px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
}

.template-hint-name {
  font-size: 0.76rem;
  font-weight: 600;
  color: #a5b4fc;
  margin-bottom: 2px;
}

.template-hint-desc {
  font-size: 0.72rem;
  color: #94a3b8;
  line-height: 1.35;
}

.anim-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ==================== AI 深度思考推演看板 (DeepSeek 风格) ==================== */
.ai-thought-panel {
  position: relative;
  z-index: 15;
  margin: 16px 20px 0 20px;
  background: rgba(13, 21, 39, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 14px;
  box-shadow: 0 12px 30px -6px rgba(0, 0, 0, 0.6);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.ai-thought-panel.is-collapsed {
  background: rgba(13, 21, 39, 0.75);
  border-color: rgba(99, 102, 241, 0.2);
}

.thought-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  background: rgba(99, 102, 241, 0.08);
  transition: background 0.2s;
}

.thought-header:hover {
  background: rgba(99, 102, 241, 0.15);
}

.thought-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.thought-spark-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

.thought-spark-icon.pulsing {
  animation: brainPulse 2s ease-in-out infinite;
}

@keyframes brainPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6); }
  50% { transform: scale(1.08); box-shadow: 0 0 14px 4px rgba(168, 85, 247, 0.6); }
}

.thought-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #f1f5f9;
}

.thought-timer-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 3px 9px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.thought-timer-pill.is-active {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.4);
}

.thought-toggle-btn {
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.thought-header:hover .thought-toggle-btn {
  color: #fff;
}

.thought-body {
  max-height: 220px;
  overflow-y: auto;
  padding: 12px 16px;
  background: rgba(6, 11, 23, 0.6);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.thought-text-stream {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.6;
  color: #94a3b8;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ==================== 实时题目拟定预览流 ==================== */
.live-draft-stream-overlay {
  position: relative;
  z-index: 10;
  margin: 14px 20px;
  padding: 14px 16px;
  background: rgba(13, 21, 39, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  max-height: 280px;
  overflow-y: auto;
}

.live-draft-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #a5b4fc;
  margin-bottom: 12px;
}

.live-draft-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.live-draft-card {
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: draftCardSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes draftCardSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.live-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.live-card-idx {
  font-size: 0.72rem;
  font-weight: 700;
  color: #6366f1;
}

.live-card-badge {
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.live-card-jump-badge {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.live-card-title {
  font-size: 0.8rem;
  font-weight: 500;
  color: #f1f5f9;
  line-height: 1.35;
}

.live-card-opts {
  font-size: 0.7rem;
  color: #64748b;
}
</style>
