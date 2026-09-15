<script setup lang="ts">
import { ref, onMounted, computed, watch, h } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  NNotificationProvider,
  NDialogProvider,
  useMessage,
  useDialog,
  NLayout,
  NLayoutHeader,
  NLayoutSider,
  NLayoutContent,
  NSpace,
  NCard,
  NButton,
  NInput,
  NSelect,
  NSwitch,
  NTag,
  NTooltip,
  NSpin,
  NEmpty,
  NPopconfirm,
  NRadioGroup,
  NRadioButton,
  NModal,
  NDrawer,
  NDropdown,
  type GlobalThemeOverrides,
  type SelectOption,
  type DropdownOption,
} from 'naive-ui';
import {
  ExternalLink,
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  GitBranch,
  ListOrdered,
  Edit3,
  Check,
  AlertCircle,
  Sparkles,
  Search,
  Sliders,
  Maximize2,
  Eye,
  Settings,
  Layers,
  HelpCircle,
  FileText,
} from 'lucide-vue-next';
import { QuestionnaireRepositoryService } from '../services/questionnaire-repository-service';
import type {
  QuestionnaireModel,
  QuestionItemModel,
  QuestionKind,
  JumpRule,
} from '../schema/questionnaire-schema-types';
import SurveyFlowCanvas from '../canvas/components/SurveyFlowCanvas.vue';

// 统一浅色主题配置（与控制台保持极致一致）
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

// 状态管理
const isLoading = ref(true);
const isSaving = ref(false);
const isDirty = ref(false);
const currentSurveyId = ref('');
const questionnaire = ref<QuestionnaireModel | null>(null);
const allSurveys = ref<Array<{ id: string; title: string; slug?: string }>>([]);
const outlineSearchQuery = ref('');

// 视图模式: 'editor' 逻辑大纲与属性编排 | 'flow' 流程拓扑全屏 | 'split' 左右分屏联动
const viewMode = ref<'editor' | 'flow' | 'split'>('editor');

// 当前选中的题目索引
const activeQuestionIndex = ref(0);

// 标题行内编辑
const isEditingTitle = ref(false);
const tempTitle = ref('');

// 批量添加选项弹窗
const showBatchOptionModal = ref(false);
const batchOptionText = ref('');

// 题型选项
const questionTypeOptions: SelectOption[] = [
  { label: '单选题 (Single Choice)', value: 'single_choice' },
  { label: '多选题 (Multiple Choice)', value: 'multiple_choice' },
  { label: '李克特量表 (Likert Scale)', value: 'likert_scale' },
  { label: '开放问答 (Text Input)', value: 'text_input' },
];

// 添加题目下拉菜单选项
const addQuestionDropdownOptions: DropdownOption[] = [
  { label: '单选题 (Single Choice)', key: 'single_choice' },
  { label: '多选题 (Multiple Choice)', key: 'multiple_choice' },
  { label: '李克特量表 (Likert Scale)', key: 'likert_scale' },
  { label: '开放问答 (Text Input)', key: 'text_input' },
];

// 量表预设刻度选项
const likertPresetOptions: DropdownOption[] = [
  { label: '5 级满意度 (非常不满意 ~ 非常满意)', key: 'satisfaction_5' },
  { label: '5 级赞同度 (完全不同意 ~ 完全同意)', key: 'agreement_5' },
  { label: '3 级评价 (不满意 / 一般 / 满意)', key: 'eval_3' },
  { label: '5 级符合度 (完全不符合 ~ 完全符合)', key: 'match_5' },
  { label: '10 阶评分 (0 ~ 10 分)', key: 'nps_10' },
];

const currentQuestion = computed<QuestionItemModel | undefined>(() => {
  return questionnaire.value?.questions[activeQuestionIndex.value];
});

const respondentUrl = computed(() => {
  if (!questionnaire.value) return '#';
  const targetId = questionnaire.value.slug || questionnaire.value.id || currentSurveyId.value;
  return `/survey.html?id=${encodeURIComponent(targetId)}`;
});

const surveySelectOptions = computed<SelectOption[]>(() => {
  return allSurveys.value.map((s) => ({
    label: s.title,
    value: s.id,
  }));
});

const filteredQuestions = computed(() => {
  if (!questionnaire.value) return [];
  if (!outlineSearchQuery.value.trim()) {
    return questionnaire.value.questions.map((q, idx) => ({ q, idx }));
  }
  const query = outlineSearchQuery.value.toLowerCase().trim();
  return questionnaire.value.questions
    .map((q, idx) => ({ q, idx }))
    .filter(
      ({ q, idx }) =>
        `q${idx + 1}`.includes(query) ||
        q.title.toLowerCase().includes(query) ||
        (q.description && q.description.toLowerCase().includes(query))
    );
});

// 跳转目标选项列表
const jumpTargetOptions = computed<SelectOption[]>(() => {
  if (!questionnaire.value) return [];
  const list: SelectOption[] = questionnaire.value.questions.map((q, idx) => ({
    label: `Q${idx + 1}: ${q.title.slice(0, 24)}${q.title.length > 24 ? '...' : ''}`,
    value: q.id,
  }));
  list.push({ label: '🏁 正常结束作答 (End)', value: 'end' });
  list.push({ label: '🚫 甄别淘汰终止 (Exit)', value: 'exit' });
  return list;
});

function markDirty() {
  isDirty.value = true;
}

// 题型切换深度转换与自适应初始化
function handleQuestionTypeChange(newType: string | number) {
  if (!currentQuestion.value) return;
  const targetType = String(newType) as QuestionKind;
  currentQuestion.value.type = targetType;

  if (targetType === 'text_input') {
    if (!currentQuestion.value.placeholder) {
      currentQuestion.value.placeholder = '请输入您的回答内容...';
    }
  } else if (targetType === 'likert_scale') {
    if (!currentQuestion.value.statements || currentQuestion.value.statements.length === 0) {
      currentQuestion.value.statements = ['整体表现与综合体验', '服务响应与处理效率', '交付质量与期望符合度'];
    }
    if (!currentQuestion.value.options || currentQuestion.value.options.length < 2) {
      currentQuestion.value.options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
    }
  } else if (targetType === 'single_choice' || targetType === 'multiple_choice') {
    if (!currentQuestion.value.options || currentQuestion.value.options.length === 0) {
      currentQuestion.value.options = ['选项 1', '选项 2', '选项 3'];
    }
  }
  markDirty();
}

// 从后端拉取问卷
async function loadSurvey(id: string) {
  if (!id) return;
  isLoading.value = true;
  currentSurveyId.value = id;
  try {
    const fetched = await QuestionnaireRepositoryService.getSurvey(id);
    questionnaire.value = JSON.parse(JSON.stringify(fetched));
    activeQuestionIndex.value = 0;
    isDirty.value = false;
  } catch (err) {
    console.error(`[Studio] 从后端装载问卷 ${id} 失败:`, err);
    questionnaire.value = null;
  } finally {
    isLoading.value = false;
  }
}

// 切换问卷
function handleSurveyChange(val: string | number) {
  if (val) {
    loadSurvey(String(val));
  }
}

// 题目操作
function selectQuestion(index: number) {
  if (questionnaire.value && index >= 0 && index < questionnaire.value.questions.length) {
    activeQuestionIndex.value = index;
  }
}

function handleCanvasSelectQuestion(nodeId: string) {
  if (!questionnaire.value) return;
  const idx = questionnaire.value.questions.findIndex((q) => q.id === nodeId);
  if (idx >= 0) {
    activeQuestionIndex.value = idx;
    if (viewMode.value === 'flow') {
      viewMode.value = 'split';
    }
  }
}

function handleAddQuestionDropdown(key: string | number) {
  addQuestion(String(key) as QuestionKind);
}

function addQuestion(type: QuestionKind = 'single_choice') {
  if (!questionnaire.value) return;
  const count = questionnaire.value.questions.length + 1;
  const newId = `q${count}`;

  let defaultOptions: string[] | undefined = undefined;
  let defaultStatements: string[] | undefined = undefined;

  if (type === 'single_choice' || type === 'multiple_choice') {
    defaultOptions = ['选项 1', '选项 2', '选项 3'];
  } else if (type === 'likert_scale') {
    defaultStatements = [
      '功能操作直观，易于上手',
      '界面排版美观，视觉舒适',
      '整体产品体验符合我的预期',
    ];
    defaultOptions = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
  }

  const newQ: QuestionItemModel = {
    id: newId,
    type,
    title: type === 'likert_scale' ? `请对以下各项维度进行评价 ${count}` : `新题目 ${count}`,
    required: true,
    options: defaultOptions,
    statements: defaultStatements,
  };

  questionnaire.value.questions.push(newQ);
  activeQuestionIndex.value = questionnaire.value.questions.length - 1;
  markDirty();
}

function deleteQuestion(index: number) {
  if (!questionnaire.value) return;
  if (questionnaire.value.questions.length <= 1) {
    return;
  }
  questionnaire.value.questions.splice(index, 1);
  if (activeQuestionIndex.value >= questionnaire.value.questions.length) {
    activeQuestionIndex.value = questionnaire.value.questions.length - 1;
  }
  markDirty();
}

function duplicateQuestion(index: number) {
  if (!questionnaire.value) return;
  const src = questionnaire.value.questions[index];
  const count = questionnaire.value.questions.length + 1;
  const clone: QuestionItemModel = {
    ...JSON.parse(JSON.stringify(src)),
    id: `q${count}`,
    title: `${src.title} (副本)`,
  };
  questionnaire.value.questions.splice(index + 1, 0, clone);
  activeQuestionIndex.value = index + 1;
  markDirty();
}

function moveQuestion(index: number, direction: 'up' | 'down') {
  if (!questionnaire.value) return;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= questionnaire.value.questions.length) return;
  const temp = questionnaire.value.questions[index];
  questionnaire.value.questions[index] = questionnaire.value.questions[target];
  questionnaire.value.questions[target] = temp;
  activeQuestionIndex.value = target;
  markDirty();
}

// 评测条目 (Statements) 操作
function addStatement() {
  if (!currentQuestion.value) return;
  if (!Array.isArray(currentQuestion.value.statements)) {
    currentQuestion.value.statements = [];
  }
  const nextIdx = currentQuestion.value.statements.length + 1;
  currentQuestion.value.statements.push(`评测条目 ${nextIdx}`);
  markDirty();
}

function removeStatement(stmtIndex: number) {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.statements)) return;
  if (currentQuestion.value.statements.length <= 1) {
    return;
  }
  currentQuestion.value.statements.splice(stmtIndex, 1);
  markDirty();
}

function updateStatementText(stmtIndex: number, text: string) {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.statements)) return;
  const target = currentQuestion.value.statements[stmtIndex];
  if (typeof target === 'object' && target !== null) {
    (target as any).label = text;
  } else {
    currentQuestion.value.statements[stmtIndex] = text;
  }
  markDirty();
}

// 选项操作
function addOption() {
  if (!currentQuestion.value) return;
  if (!Array.isArray(currentQuestion.value.options)) {
    currentQuestion.value.options = [];
  }
  const nextIdx = currentQuestion.value.options.length + 1;
  currentQuestion.value.options.push(
    currentQuestion.value.type === 'likert_scale' ? `第 ${nextIdx} 级` : `选项 ${nextIdx}`
  );
  markDirty();
}

function removeOption(optIndex: number) {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.options)) return;
  if (currentQuestion.value.options.length <= 1) {
    return;
  }
  currentQuestion.value.options.splice(optIndex, 1);
  markDirty();
}

function updateOptionText(optIndex: number, text: string) {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.options)) return;
  const target = currentQuestion.value.options[optIndex];
  if (typeof target === 'object' && target !== null) {
    (target as any).label = text;
  } else {
    currentQuestion.value.options[optIndex] = text;
  }
  markDirty();
}

function applyLikertPreset(presetKey: string | number) {
  if (!currentQuestion.value) return;
  switch (presetKey) {
    case 'satisfaction_5':
      currentQuestion.value.options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
      break;
    case 'agreement_5':
      currentQuestion.value.options = ['完全不同意', '不同意', '一般', '同意', '完全同意'];
      break;
    case 'eval_3':
      currentQuestion.value.options = ['差', '一般', '满意'];
      break;
    case 'match_5':
      currentQuestion.value.options = ['完全不符合', '不太符合', '一般', '比较符合', '完全符合'];
      break;
    case 'nps_10':
      currentQuestion.value.options = ['0分', '1分', '2分', '3分', '4分', '5分', '6分', '7分', '8分', '9分', '10分'];
      break;
  }
  markDirty();
}

// 批量添加选项
function openBatchOptionModal() {
  batchOptionText.value = '';
  showBatchOptionModal.value = true;
}

function handleApplyBatchOptions() {
  if (!currentQuestion.value) return;
  const lines = batchOptionText.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 0) {
    currentQuestion.value.options = lines;
    markDirty();
  }
  showBatchOptionModal.value = false;
}

// 跳转逻辑规则
function getConditionalJumpRules(): JumpRule[] {
  if (!currentQuestion.value || !currentQuestion.value.jump) return [];
  if (typeof currentQuestion.value.jump === 'string') return [];
  if (Array.isArray(currentQuestion.value.jump)) {
    return currentQuestion.value.jump.filter((r) => r.when && Object.keys(r.when).length > 0);
  }
  return [];
}

function addJumpRule() {
  if (!questionnaire.value || !currentQuestion.value) return;
  if (!currentQuestion.value.jump || typeof currentQuestion.value.jump === 'string') {
    currentQuestion.value.jump = [];
  }
  const qId = currentQuestion.value.id;
  const defaultTarget =
    questionnaire.value.questions[activeQuestionIndex.value + 1]?.id || 'end';

  (currentQuestion.value.jump as JumpRule[]).push({
    when: { [qId]: 0 },
    to: defaultTarget,
  });
  markDirty();
}

function removeJumpRule(rule: JumpRule) {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.jump)) return;
  const idx = currentQuestion.value.jump.indexOf(rule);
  if (idx > -1) {
    currentQuestion.value.jump.splice(idx, 1);
  }
  if (currentQuestion.value.jump.length === 0) {
    delete currentQuestion.value.jump;
  }
  markDirty();
}

function updateRuleOptionChoice(rule: JumpRule, optionIndex: number) {
  if (!currentQuestion.value) return;
  const qId = currentQuestion.value.id;
  rule.when = { [qId]: optionIndex };
  markDirty();
}

function updateRuleTarget(rule: JumpRule, targetId: string) {
  rule.to = targetId;
  markDirty();
}

// 保存问卷到数据库
async function handleSave(notifyMsg?: any) {
  if (!questionnaire.value || isSaving.value) return;
  isSaving.value = true;
  try {
    const targetId = questionnaire.value.slug || questionnaire.value.id || currentSurveyId.value;
    const success = await QuestionnaireRepositoryService.updateSurvey(
      targetId,
      questionnaire.value
    );
    if (success) {
      isDirty.value = false;
      if (notifyMsg) {
        notifyMsg.success('问卷已成功保存至数据库');
      }
    } else {
      if (notifyMsg) notifyMsg.error('保存问卷失败，请检查后端状态');
    }
  } catch (err) {
    console.error('[Studio] 保存问卷异常:', err);
    if (notifyMsg) notifyMsg.error('保存问卷网络异常');
  } finally {
    isSaving.value = false;
  }
}

// 标题行内编辑
function startEditTitle() {
  if (!questionnaire.value) return;
  tempTitle.value = questionnaire.value.title;
  isEditingTitle.value = true;
}

function finishEditTitle() {
  if (questionnaire.value && tempTitle.value.trim()) {
    questionnaire.value.title = tempTitle.value.trim();
    markDirty();
  }
  isEditingTitle.value = false;
}

function getQuestionTypeName(type: QuestionKind) {
  switch (type) {
    case 'single_choice':
      return '单选';
    case 'multiple_choice':
      return '多选';
    case 'likert_scale':
      return '量表';
    case 'text_input':
      return '问答';
    default:
      return '题目';
  }
}

function getQuestionTypeTagType(type: QuestionKind): 'primary' | 'info' | 'success' | 'warning' | 'default' {
  switch (type) {
    case 'single_choice':
      return 'primary';
    case 'multiple_choice':
      return 'info';
    case 'likert_scale':
      return 'success';
    case 'text_input':
      return 'warning';
    default:
      return 'default';
  }
}

// 返回控制台
function handleClosePage() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
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
    console.error('[Studio] 初始化加载失败:', err);
    isLoading.value = false;
  }

  // Ctrl+S 快捷键保存
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  });
});
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NNotificationProvider placement="bottom-right">
      <NMessageProvider>
        <div class="studio-app-root">
          <!-- 顶部工作台顶栏 -->
          <header class="studio-header">
            <div class="header-left">
              <NButton
                quaternary
                circle
                size="medium"
                title="返回控制台"
                @click="handleClosePage"
              >
                <template #icon><ArrowLeft :size="18" /></template>
              </NButton>

              <div class="brand-badge-group">
                <span class="studio-badge">STUDIO</span>
                <span class="brand-title">TypeSense 逻辑编排</span>
              </div>

              <div class="header-v-divider"></div>

              <!-- 问卷标题 (点击即可即时行内编辑) -->
              <div v-if="questionnaire" class="title-inline-box">
                <div v-if="!isEditingTitle" class="title-display" @click="startEditTitle" title="点击编辑问卷标题">
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

            <!-- 中心视图模式分段切换 -->
            <div class="header-center">
              <NRadioGroup v-model:value="viewMode" size="small">
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

            <!-- 右侧操作栏 -->
            <div class="header-right">
              <!-- 切换问卷 -->
              <NSelect
                v-if="allSurveys.length > 1"
                :value="currentSurveyId"
                :options="surveySelectOptions"
                size="small"
                style="min-width: 160px; max-width: 220px;"
                @update:value="handleSurveyChange"
              />

              <!-- 保存按钮 -->
              <NButton
                :type="isDirty ? 'primary' : 'default'"
                size="small"
                :loading="isSaving"
                @click="handleSave"
              >
                <template #icon><Save :size="14" /></template>
                <span>{{ isDirty ? '保存改动 *' : '已保存' }}</span>
              </NButton>

              <!-- 受访体验 -->
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

          <!-- 工作台主体 -->
          <main class="studio-main-body">
            <!-- 1. 加载中 -->
            <div v-if="isLoading" class="studio-state-stage">
              <NSpin size="large" />
              <p class="state-hint">正在从数据库装载问卷数据...</p>
            </div>

            <!-- 2. 无问卷空状态 -->
            <div v-else-if="!questionnaire" class="studio-state-stage">
              <AlertCircle :size="48" style="color: #94a3b8;" />
              <h3 class="state-title">未找到对应的问卷数据</h3>
              <p class="state-hint">请确认问卷 ID 是否正确，或返回控制台重新进入。</p>
              <NButton type="primary" size="medium" @click="handleClosePage">
                ← 返回控制台
              </NButton>
            </div>

            <!-- 3. 流程拓扑全屏模式 -->
            <div v-else-if="viewMode === 'flow'" class="flow-fullscreen-stage">
              <SurveyFlowCanvas
                :key="currentSurveyId"
                :questionnaire="questionnaire"
                @select-question="handleCanvasSelectQuestion"
              />
            </div>

            <!-- 4. 逻辑编排 / 分屏模式 -->
            <div v-else class="studio-workspace-container" :class="{ 'is-split-mode': viewMode === 'split' }">
              <!-- 左侧大纲导航栏 -->
              <aside class="outline-sidebar">
                <div class="outline-header">
                  <div class="outline-title-row">
                    <span class="outline-heading">题目大纲</span>
                    <NTag size="small" type="default" :bordered="false" round>
                      {{ questionnaire.questions.length }} 题
                    </NTag>
                  </div>
                  <div class="outline-search-row">
                    <NInput
                      v-model:value="outlineSearchQuery"
                      size="small"
                      placeholder="搜索题目序号/标题..."
                      clearable
                    >
                      <template #prefix><Search :size="13" style="color: #94a3b8;" /></template>
                    </NInput>
                    <NDropdown
                      trigger="click"
                      :options="addQuestionDropdownOptions"
                      @select="handleAddQuestionDropdown"
                    >
                      <NButton size="small" type="primary">
                        <template #icon><Plus :size="14" /></template>
                        <span>加题</span>
                      </NButton>
                    </NDropdown>
                  </div>
                </div>

                <!-- 题目列表 -->
                <div class="outline-list-scroller">
                  <div
                    v-for="{ q, idx } in filteredQuestions"
                    :key="q.id"
                    class="outline-item-card"
                    :class="{ 'is-active': idx === activeQuestionIndex }"
                    @click="selectQuestion(idx)"
                  >
                    <div class="item-main-row">
                      <span class="item-index-label">Q{{ idx + 1 }}</span>
                      <NTag size="tiny" :type="getQuestionTypeTagType(q.type)" :bordered="false">
                        {{ getQuestionTypeName(q.type) }}
                      </NTag>
                      <span class="item-title-text" :title="q.title">{{ q.title }}</span>
                      <span v-if="q.jump" class="item-jump-badge" title="配置了分支跳转规则">⚡</span>
                    </div>

                    <!-- 操作按钮组 -->
                    <div class="item-actions-row" @click.stop>
                      <NTooltip trigger="hover">
                        <template #trigger>
                          <NButton
                            quaternary
                            size="tiny"
                            :disabled="idx === 0"
                            @click="moveQuestion(idx, 'up')"
                          >
                            <template #icon><ChevronUp :size="13" /></template>
                          </NButton>
                        </template>
                        上移
                      </NTooltip>

                      <NTooltip trigger="hover">
                        <template #trigger>
                          <NButton
                            quaternary
                            size="tiny"
                            :disabled="idx === questionnaire.questions.length - 1"
                            @click="moveQuestion(idx, 'down')"
                          >
                            <template #icon><ChevronDown :size="13" /></template>
                          </NButton>
                        </template>
                        下移
                      </NTooltip>

                      <NTooltip trigger="hover">
                        <template #trigger>
                          <NButton
                            quaternary
                            size="tiny"
                            @click="duplicateQuestion(idx)"
                          >
                            <template #icon><Copy :size="13" /></template>
                          </NButton>
                        </template>
                        复制
                      </NTooltip>

                      <NPopconfirm
                        @positive-click="deleteQuestion(idx)"
                        positive-text="确认删除"
                        negative-text="取消"
                      >
                        <template #trigger>
                          <NButton
                            quaternary
                            size="tiny"
                            type="error"
                            :disabled="questionnaire.questions.length <= 1"
                          >
                            <template #icon><Trash2 :size="13" /></template>
                          </NButton>
                        </template>
                        确定删除此题目？
                      </NPopconfirm>
                    </div>
                  </div>
                </div>
              </aside>

              <!-- 中间/右侧主编辑区 -->
              <section class="inspector-workbench">
                <div v-if="currentQuestion" class="inspector-scroll-content">
                  <!-- 题目主属性顶栏卡片 -->
                  <div class="inspector-meta-card">
                    <div class="meta-left">
                      <span class="q-seq-badge">第 {{ activeQuestionIndex + 1 }} 题</span>
                      <NTag size="small" type="default" :bordered="false">{{ currentQuestion.id }}</NTag>
                    </div>

                    <div class="meta-right">
                      <div class="meta-control-item">
                        <span class="control-label">题型：</span>
                        <NSelect
                          :value="currentQuestion.type"
                          :options="questionTypeOptions"
                          size="small"
                          style="width: 200px;"
                          @update:value="handleQuestionTypeChange"
                        />
                      </div>
                      <div class="meta-control-item">
                        <NSwitch
                          v-model:value="currentQuestion.required"
                          size="small"
                          @update:value="markDirty"
                        />
                        <span class="control-label">必填</span>
                      </div>
                    </div>
                  </div>

                  <!-- 基础题干与说明配置 -->
                  <div class="inspector-section-card">
                    <div class="section-card-header">
                      <h4 class="section-card-title">题目标题与描述</h4>
                    </div>
                    <div class="form-vertical-group">
                      <div class="form-field">
                        <label class="field-label">题干内容</label>
                        <NInput
                          v-model:value="currentQuestion.title"
                          size="medium"
                          placeholder="请输入题目内容..."
                          clearable
                          @update:value="markDirty"
                        />
                      </div>
                      <div class="form-field">
                        <label class="field-label">补充说明 (选填)</label>
                        <NInput
                          v-model:value="currentQuestion.description"
                          type="textarea"
                          :rows="2"
                          placeholder="为受访者补充说明作答背景、规则或引导语..."
                          clearable
                          @update:value="markDirty"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- 专属设置 1：李克特量表 (Statements + Options) -->
                  <div v-if="currentQuestion.type === 'likert_scale'" class="inspector-section-card">
                    <!-- 评测条目设置 (Statements) -->
                    <div class="section-card-header">
                      <div class="header-title-flex">
                        <h4 class="section-card-title">纵向评测条目 (Statements)</h4>
                        <NTag size="tiny" type="success" :bordered="false">
                          共 {{ (currentQuestion.statements || []).length }} 项
                        </NTag>
                      </div>
                      <NButton size="tiny" type="primary" secondary @click="addStatement">
                        <template #icon><Plus :size="12" /></template>
                        <span>添加条目</span>
                      </NButton>
                    </div>

                    <div class="items-list-box">
                      <div
                        v-for="(stmt, sIdx) in currentQuestion.statements || []"
                        :key="sIdx"
                        class="edit-item-row"
                      >
                        <span class="row-seq-pill">{{ sIdx + 1 }}</span>
                        <NInput
                          :value="typeof stmt === 'string' ? stmt : (stmt as any).label"
                          size="small"
                          placeholder="输入评价维度或陈述内容..."
                          @update:value="(val) => updateStatementText(sIdx, val)"
                        />
                        <NButton
                          quaternary
                          size="tiny"
                          type="error"
                          :disabled="(currentQuestion.statements || []).length <= 1"
                          @click="removeStatement(sIdx)"
                        >
                          <template #icon><Trash2 :size="13" /></template>
                        </NButton>
                      </div>
                    </div>

                    <!-- 评分刻度 (Options) -->
                    <div class="section-card-header" style="margin-top: 24px;">
                      <div class="header-title-flex">
                        <h4 class="section-card-title">横向评分标尺 (Scale Levels)</h4>
                        <NTag size="tiny" type="info" :bordered="false">
                          {{ (currentQuestion.options || []).length }} 阶刻度
                        </NTag>
                      </div>
                      <div class="header-actions-flex">
                        <NDropdown
                          trigger="click"
                          :options="likertPresetOptions"
                          @select="applyLikertPreset"
                        >
                          <NButton size="tiny" secondary>
                            <span>套用标准预设 ▾</span>
                          </NButton>
                        </NDropdown>
                        <NButton size="tiny" type="primary" secondary @click="addOption">
                          <template #icon><Plus :size="12" /></template>
                          <span>增加刻度</span>
                        </NButton>
                      </div>
                    </div>

                    <div class="items-list-box">
                      <div
                        v-for="(opt, oIdx) in currentQuestion.options || []"
                        :key="oIdx"
                        class="edit-item-row"
                      >
                        <span class="row-seq-pill scale-pill">{{ oIdx + 1 }}</span>
                        <NInput
                          :value="typeof opt === 'string' ? opt : (opt as any).label"
                          size="small"
                          placeholder="刻度标签文本..."
                          @update:value="(val) => updateOptionText(oIdx, val)"
                        />
                        <NButton
                          quaternary
                          size="tiny"
                          type="error"
                          :disabled="(currentQuestion.options || []).length <= 1"
                          @click="removeOption(oIdx)"
                        >
                          <template #icon><Trash2 :size="13" /></template>
                        </NButton>
                      </div>
                    </div>
                  </div>

                  <!-- 专属设置 2：单选 / 多选题选项 (Options) -->
                  <div
                    v-else-if="currentQuestion.type === 'single_choice' || currentQuestion.type === 'multiple_choice'"
                    class="inspector-section-card"
                  >
                    <div class="section-card-header">
                      <div class="header-title-flex">
                        <h4 class="section-card-title">选项列表 (Options)</h4>
                        <NTag
                          size="tiny"
                          :type="currentQuestion.type === 'multiple_choice' ? 'info' : 'primary'"
                          :bordered="false"
                        >
                          {{ currentQuestion.type === 'multiple_choice' ? '多选题模式' : '单选题模式' }}
                        </NTag>
                      </div>
                      <div class="header-actions-flex">
                        <NButton size="tiny" secondary @click="openBatchOptionModal">
                          <span>批量粘贴导入</span>
                        </NButton>
                        <NButton size="tiny" type="primary" secondary @click="addOption">
                          <template #icon><Plus :size="12" /></template>
                          <span>增加选项</span>
                        </NButton>
                      </div>
                    </div>

                    <div class="items-list-box">
                      <div
                        v-for="(opt, oIdx) in currentQuestion.options || []"
                        :key="oIdx"
                        class="edit-item-row"
                      >
                        <span class="row-seq-pill letter-pill">
                          {{ String.fromCharCode(65 + oIdx) }}
                        </span>
                        <NInput
                          :value="typeof opt === 'string' ? opt : (opt as any).label"
                          size="small"
                          placeholder="输入选项内容..."
                          @update:value="(val) => updateOptionText(oIdx, val)"
                        />
                        <NButton
                          quaternary
                          size="tiny"
                          type="error"
                          :disabled="(currentQuestion.options || []).length <= 1"
                          @click="removeOption(oIdx)"
                        >
                          <template #icon><Trash2 :size="13" /></template>
                        </NButton>
                      </div>
                    </div>
                  </div>

                  <!-- 专属设置 3：问答填空题 (Text Input) -->
                  <div v-else-if="currentQuestion.type === 'text_input'" class="inspector-section-card">
                    <div class="section-card-header">
                      <h4 class="section-card-title">开放问答设置</h4>
                    </div>
                    <div class="form-field">
                      <label class="field-label">输入占位提示语 (Placeholder)</label>
                      <NInput
                        v-model:value="currentQuestion.placeholder"
                        size="medium"
                        placeholder="例如：请详细阐述您的看法与建议..."
                        clearable
                        @update:value="markDirty"
                      />
                    </div>
                  </div>

                  <!-- 有向图逻辑跳转规则配置 (Jump Logic Rules) -->
                  <div class="inspector-section-card">
                    <div class="section-card-header">
                      <div class="header-title-flex">
                        <h4 class="section-card-title">逻辑跳转与分支流控 (Jump Rules)</h4>
                        <NTag
                          size="tiny"
                          :type="getConditionalJumpRules().length > 0 ? 'warning' : 'default'"
                          :bordered="false"
                        >
                          {{ getConditionalJumpRules().length > 0 ? `${getConditionalJumpRules().length} 条分支规则` : '默认顺序推进' }}
                        </NTag>
                      </div>
                      <NButton
                        v-if="currentQuestion.type === 'single_choice' || currentQuestion.type === 'multiple_choice'"
                        size="tiny"
                        type="primary"
                        secondary
                        @click="addJumpRule"
                      >
                        <template #icon><Plus :size="12" /></template>
                        <span>添加跳转条件</span>
                      </NButton>
                    </div>

                    <div v-if="getConditionalJumpRules().length > 0" class="jump-rules-container">
                      <div
                        v-for="(rule, rIdx) in getConditionalJumpRules()"
                        :key="rIdx"
                        class="jump-rule-card"
                      >
                        <div class="rule-logic-row">
                          <span class="rule-label">当选择</span>
                          <NSelect
                            :value="rule.when ? rule.when[currentQuestion.id] : 0"
                            :options="
                              (currentQuestion.options || []).map((opt, idx) => ({
                                label: `选项 ${String.fromCharCode(65 + idx)}: ${typeof opt === 'string' ? opt : (opt as any).label}`,
                                value: idx,
                              }))
                            "
                            size="small"
                            style="min-width: 180px; flex: 1;"
                            @update:value="(val) => updateRuleOptionChoice(rule, Number(val))"
                          />
                          <span class="rule-arrow">➔ 跳转至</span>
                          <NSelect
                            :value="rule.to"
                            :options="jumpTargetOptions"
                            size="small"
                            style="min-width: 180px; flex: 1;"
                            @update:value="(val) => updateRuleTarget(rule, String(val))"
                          />
                          <NButton
                            quaternary
                            size="tiny"
                            type="error"
                            @click="removeJumpRule(rule)"
                          >
                            <template #icon><Trash2 :size="13" /></template>
                          </NButton>
                        </div>
                      </div>
                    </div>
                    <div v-else class="jump-empty-hint">
                      <span>未配置特殊条件，受访者作答后将自然顺延进入下一题。</span>
                    </div>
                  </div>
                </div>
              </section>

              <!-- 分屏模式右侧流程拓扑画布 -->
              <aside v-if="viewMode === 'split'" class="split-canvas-sidebar">
                <SurveyFlowCanvas
                  :key="currentSurveyId"
                  :questionnaire="questionnaire"
                  @select-question="handleCanvasSelectQuestion"
                />
              </aside>
            </div>
          </main>

          <!-- 批量添加选项模态窗 -->
          <NModal
            v-model:show="showBatchOptionModal"
            preset="card"
            title="批量导入选项"
            style="width: 500px;"
          >
            <p style="font-size: 13px; color: #64748b; margin: 0 0 10px 0;">
              每行输入一个选项内容，提交后将直接覆盖当前题目的选项列表：
            </p>
            <NInput
              v-model:value="batchOptionText"
              type="textarea"
              :rows="8"
              placeholder="例如：&#10;选项一&#10;选项二&#10;选项三"
            />
            <template #footer>
              <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <NButton size="small" @click="showBatchOptionModal = false">取消</NButton>
                <NButton size="small" type="primary" @click="handleApplyBatchOptions">
                  应用覆盖
                </NButton>
              </div>
            </template>
          </NModal>
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

/* 顶部工作台顶栏 */
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

/* 主工作台主体 */
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

/* 编排主容器 */
.studio-workspace-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* 左侧题目大纲 */
.outline-sidebar {
  width: 300px;
  background: #ffffff;
  border-right: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.outline-header {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.outline-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.outline-heading {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}

.outline-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.outline-list-scroller {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.outline-item-card {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.outline-item-card:hover {
  background: #f1f5f9;
  border-color: rgba(15, 23, 42, 0.08);
}

.outline-item-card.is-active {
  background: #eef2ff;
  border-color: #c7d2fe;
}

.item-main-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-index-label {
  font-size: 12px;
  font-weight: 800;
  color: #4f46e5;
  min-width: 24px;
}

.item-title-text {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-jump-badge {
  font-size: 11px;
  color: #d97706;
}

.item-actions-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.outline-item-card:hover .item-actions-row,
.outline-item-card.is-active .item-actions-row {
  opacity: 1;
}

/* 中间属性与逻辑主编辑区 */
.inspector-workbench {
  flex: 1;
  background: #f8fafc;
  overflow-y: auto;
  padding: 20px 24px;
}

.inspector-scroll-content {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inspector-meta-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.meta-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.q-seq-badge {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.meta-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.meta-control-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.inspector-section-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  padding: 18px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.section-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.header-title-flex {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions-flex {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-card-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.form-vertical-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.items-list-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-seq-pill {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.scale-pill {
  background: #ecfdf5;
  color: #059669;
}

.letter-pill {
  background: #eef2ff;
  color: #4f46e5;
}

/* 跳转规则 */
.jump-rules-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.jump-rule-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.rule-logic-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-label,
.rule-arrow {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
}

.jump-empty-hint {
  font-size: 13px;
  color: #94a3b8;
  padding: 8px 0;
}

/* 分屏模式画布栏 */
.split-canvas-sidebar {
  width: 45%;
  height: 100%;
  border-left: 1px solid rgba(15, 23, 42, 0.08);
}
</style>
