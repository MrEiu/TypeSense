<script setup lang="ts">
import { ref, onMounted, computed, markRaw } from 'vue';
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
} from 'lucide-vue-next';
import { QuestionnaireRepositoryService } from '../services/questionnaire-repository-service';
import type {
  QuestionnaireModel,
  QuestionItemModel,
  QuestionKind,
  JumpRule,
} from '../schema/questionnaire-schema-types';
import SurveyFlowCanvas from '../canvas/components/SurveyFlowCanvas.vue';
import {
  TsButton,
  TsInput,
  TsTextarea,
  TsSelect,
  TsSwitch,
  TsBadge,
  TsCard,
  TsSegmented,
  type SelectOption,
  type SegmentOption,
} from '../components/ui';

// 动态状态
const isLoading = ref(true);
const isSaving = ref(false);
const saveSuccessToast = ref(false);
const isDirty = ref(false);
const currentSurveyId = ref('');
const questionnaire = ref<QuestionnaireModel | null>(null);
const allSurveys = ref<Array<{ id: string; title: string; slug?: string }>>([]);

// 视图模式: 'flow' 流程拓扑 | 'editor' 题目与逻辑编排
const viewMode = ref<string>('editor');

const viewModeOptions: SegmentOption[] = [
  { label: '逻辑编排', value: 'editor', icon: markRaw(ListOrdered) },
  { label: '流程拓扑', value: 'flow', icon: markRaw(GitBranch) },
];

// 题型选项
const questionTypeOptions: SelectOption[] = [
  { label: '单选题 (Single Choice)', value: 'single_choice' },
  { label: '多选题 (Multiple Choice)', value: 'multiple_choice' },
  { label: '量表评分 (Likert Scale)', value: 'likert_scale' },
  { label: '开放问答 (Text Input)', value: 'text_input' },
];

// 当前选中的题目索引
const activeQuestionIndex = ref(0);

// 标题行内编辑
const isEditingTitle = ref(false);
const tempTitle = ref('');

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

// 跳转目标选项列表
const jumpTargetOptions = computed<SelectOption[]>(() => {
  if (!questionnaire.value) return [];
  const list: SelectOption[] = questionnaire.value.questions.map((q, idx) => ({
    label: `Q${idx + 1}: ${q.title}`,
    value: q.id,
  }));
  list.push({ label: '🏁 正常结束作答 (End)', value: 'end' });
  list.push({ label: '🚫 甄别淘汰终止 (Exit)', value: 'exit' });
  return list;
});

// 当前题目的选项列表下拉
function getQuestionOptionChoices(): SelectOption[] {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.options)) return [];
  return currentQuestion.value.options.map((opt, idx) => {
    const text = typeof opt === 'string' ? opt : opt.label;
    return {
      label: `选项 ${String.fromCharCode(65 + idx)}: ${text}`,
      value: idx,
    };
  });
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
    // 智能初始化为 5 点量表
    if (!currentQuestion.value.options || currentQuestion.value.options.length < 3) {
      currentQuestion.value.options = ['完全不赞同', '不太赞同', '基本赞同', '非常赞同', '完全赞同'];
    }
  } else if (targetType === 'single_choice' || targetType === 'multiple_choice') {
    // 确保选择题有基础选项
    if (!currentQuestion.value.options || currentQuestion.value.options.length === 0) {
      currentQuestion.value.options = ['选项 1', '选项 2', '选项 3'];
    }
  }
  markDirty();
}

// 一键应用量表预设
function applyLikertPreset(presetType: 'satisfaction' | 'agreement' | 'frequency' | 'score') {
  if (!currentQuestion.value) return;
  if (presetType === 'satisfaction') {
    currentQuestion.value.options = ['非常不满意', '不太满意', '一般', '比较满意', '非常满意'];
  } else if (presetType === 'agreement') {
    currentQuestion.value.options = ['完全不赞同', '不太赞同', '中立', '比较赞同', '非常赞同'];
  } else if (presetType === 'frequency') {
    currentQuestion.value.options = ['从不', '极少', '有时', '经常', '总是'];
  } else if (presetType === 'score') {
    currentQuestion.value.options = ['1分', '2分', '3分', '4分', '5分'];
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

function addQuestion(type: QuestionKind = 'single_choice') {
  if (!questionnaire.value) return;
  const count = questionnaire.value.questions.length + 1;
  const newId = `q${count}`;

  let defaultOptions: string[] | undefined = undefined;
  if (type === 'single_choice' || type === 'multiple_choice') {
    defaultOptions = ['选项 1', '选项 2', '选项 3'];
  } else if (type === 'likert_scale') {
    defaultOptions = ['完全不赞同', '不太赞同', '基本赞同', '非常赞同'];
  }

  const newQ: QuestionItemModel = {
    id: newId,
    type,
    title: `新题目 ${count}`,
    required: true,
    options: defaultOptions,
  };

  questionnaire.value.questions.push(newQ);
  activeQuestionIndex.value = questionnaire.value.questions.length - 1;
  markDirty();
}

function deleteQuestion(index: number) {
  if (!questionnaire.value) return;
  if (questionnaire.value.questions.length <= 1) {
    alert('问卷至少需保留一道题目');
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

// 选项操作
function addOption() {
  if (!currentQuestion.value) return;
  if (!Array.isArray(currentQuestion.value.options)) {
    currentQuestion.value.options = [];
  }
  const nextIdx = currentQuestion.value.options.length + 1;
  currentQuestion.value.options.push(`选项 ${nextIdx}`);
  markDirty();
}

function removeOption(optIndex: number) {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.options)) return;
  if (currentQuestion.value.options.length <= 1) {
    alert('选择题至少需保留一个选项');
    return;
  }
  currentQuestion.value.options.splice(optIndex, 1);
  markDirty();
}

function updateOptionText(optIndex: number, text: string) {
  if (!currentQuestion.value || !Array.isArray(currentQuestion.value.options)) return;
  currentQuestion.value.options[optIndex] = text;
  markDirty();
}

// 跳转逻辑规则 (仅关注具体选项条件跳转 when)
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
  (currentQuestion.value.jump as JumpRule[]).push({
    when: { [qId]: 0 },
    to: questionnaire.value.questions[0]?.id || 'end',
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

function markDirty() {
  isDirty.value = true;
}

// 保存问卷到数据库
async function handleSave() {
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
      saveSuccessToast.value = true;
      setTimeout(() => {
        saveSuccessToast.value = false;
      }, 2000);
    } else {
      alert('保存问卷失败，请检查后端状态');
    }
  } catch (err) {
    console.error('[Studio] 保存问卷异常:', err);
    alert('保存问卷网络异常');
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
      return '填空';
    default:
      return '题目';
  }
}

function getQuestionTypeBadgeVariant(type: QuestionKind): 'primary' | 'info' | 'success' | 'warning' | 'neutral' {
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
      return 'neutral';
  }
}

// 点击返回直接关闭当前工作台标签页
function handleClosePage() {
  window.close();
  // 容错降级：若浏览器对非 script 打开的页面限制 window.close()，自动回退上一页
  setTimeout(() => {
    if (!window.closed) {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/';
      }
    }
  }, 120);
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
  <div class="studio-root">
    <!-- 顶部工作台顶栏 -->
    <header class="studio-header">
      <div class="header-left">
        <TsButton
          variant="ghost"
          size="sm"
          title="关闭工作台并返回控制台"
          @click="handleClosePage"
        >
          <ArrowLeft style="width: 15px; height: 15px;" />
        </TsButton>

        <div class="brand-group">
          <TsBadge variant="primary" size="sm">STUDIO</TsBadge>
          <span class="brand-name">TypeSense</span>
        </div>

        <div class="divider-v"></div>

        <!-- 问卷标题 (行内即时编辑) -->
        <div v-if="questionnaire" class="title-area">
          <div v-if="!isEditingTitle" class="title-display" @click="startEditTitle" title="点击编辑问卷标题">
            <span class="title-text">{{ questionnaire.title }}</span>
            <Edit3 style="width: 12px; height: 12px; opacity: 0.5;" />
          </div>
          <TsInput
            v-else
            v-model="tempTitle"
            size="sm"
            style="width: 260px;"
            autofocus
            @blur="finishEditTitle"
            @change="finishEditTitle"
          />
        </div>
      </div>

      <!-- 中心视图模式分段器 (TsSegmented) -->
      <div class="header-center">
        <TsSegmented
          v-model="viewMode"
          :options="viewModeOptions"
          size="sm"
        />
      </div>

      <!-- 右侧操作栏 (TsButton + TsSelect) -->
      <div class="header-right">
        <!-- 切换问卷 -->
        <TsSelect
          v-if="allSurveys.length > 1"
          :model-value="currentSurveyId"
          :options="surveySelectOptions"
          size="sm"
          style="min-width: 140px;"
          @update:model-value="handleSurveyChange"
        />

        <!-- 保存按钮 -->
        <TsButton
          v-if="questionnaire"
          :variant="isDirty ? 'primary' : 'secondary'"
          size="sm"
          :loading="isSaving"
          @click="handleSave"
        >
          <Save style="width: 14px; height: 14px;" />
          <span>{{ isDirty ? '保存改动 *' : '已保存' }}</span>
        </TsButton>

        <!-- 受访体验 -->
        <TsButton
          v-if="questionnaire"
          as="a"
          :href="respondentUrl"
          target="_blank"
          variant="secondary"
          size="sm"
          title="在新标签页体验真实作答"
        >
          <ExternalLink style="width: 14px; height: 14px;" />
          <span>受访体验</span>
        </TsButton>
      </div>
    </header>

    <!-- 工作台主体 -->
    <main class="studio-body">
      <!-- 1. 加载中 -->
      <div v-if="isLoading" class="state-stage">
        <div class="spinner"></div>
        <p>正在从数据库装载问卷数据...</p>
      </div>

      <!-- 2. 无问卷空状态 -->
      <div v-else-if="!questionnaire" class="state-stage">
        <AlertCircle style="width: 44px; height: 44px; color: #94a3b8;" />
        <h3>未找到对应的问卷数据</h3>
        <p>请确认问卷 ID 是否正确，或返回控制台选择问卷。</p>
        <TsButton as="a" href="/" variant="primary" size="md">
          ← 返回控制台
        </TsButton>
      </div>

      <!-- 3. 流程拓扑全屏模式 -->
      <div v-else-if="viewMode === 'flow'" class="flow-stage">
        <SurveyFlowCanvas
          :key="currentSurveyId"
          :questionnaire="questionnaire"
        />
      </div>

      <!-- 4. 逻辑与属性编排模式 (标准双栏) -->
      <div v-else class="editor-stage">
        <!-- 左侧题目大纲 -->
        <aside class="outline-col">
          <div class="outline-head">
            <div class="outline-meta">
              <span class="outline-label">题目大纲</span>
              <TsBadge variant="neutral" size="sm">{{ questionnaire.questions.length }} 题</TsBadge>
            </div>
            <TsButton variant="primary" size="xs" @click="addQuestion('single_choice')">
              <Plus style="width: 12px; height: 12px;" />
              <span>添加题目</span>
            </TsButton>
          </div>

          <div class="outline-body">
            <div
              v-for="(q, idx) in questionnaire.questions"
              :key="q.id"
              class="outline-node"
              :class="{ selected: idx === activeQuestionIndex }"
              @click="selectQuestion(idx)"
            >
              <div class="node-left">
                <span class="node-seq">Q{{ idx + 1 }}</span>
                <TsBadge :variant="getQuestionTypeBadgeVariant(q.type)" size="sm">
                  {{ getQuestionTypeName(q.type) }}
                </TsBadge>
                <span class="node-title" :title="q.title">{{ q.title }}</span>
              </div>

              <div class="node-actions" @click.stop>
                <span v-if="q.jump" class="node-jump-flag" title="包含分支跳转规则">⚡</span>
                <TsButton
                  variant="ghost"
                  size="xs"
                  class="action-mini-btn"
                  :disabled="idx === 0"
                  title="上移"
                  @click="moveQuestion(idx, 'up')"
                >
                  <ChevronUp style="width: 12px; height: 12px;" />
                </TsButton>
                <TsButton
                  variant="ghost"
                  size="xs"
                  class="action-mini-btn"
                  :disabled="idx === questionnaire.questions.length - 1"
                  title="下移"
                  @click="moveQuestion(idx, 'down')"
                >
                  <ChevronDown style="width: 12px; height: 12px;" />
                </TsButton>
                <TsButton
                  variant="ghost"
                  size="xs"
                  class="action-mini-btn"
                  title="复制"
                  @click="duplicateQuestion(idx)"
                >
                  <Copy style="width: 12px; height: 12px;" />
                </TsButton>
                <TsButton
                  variant="ghost"
                  size="xs"
                  class="action-mini-btn btn-danger"
                  title="删除"
                  @click="deleteQuestion(idx)"
                >
                  <Trash2 style="width: 12px; height: 12px;" />
                </TsButton>
              </div>
            </div>
          </div>
        </aside>

        <!-- 右侧题目属性与逻辑配置区 (TsCard + TsInput + TsSelect + TsSwitch) -->
        <section class="inspector-col">
          <div v-if="currentQuestion" class="inspector-wrapper">
            <!-- 题目顶部摘要条 -->
            <div class="detail-header">
              <div class="detail-meta">
                <span class="detail-q-tag">第 {{ activeQuestionIndex + 1 }} 题</span>
                <TsBadge variant="neutral" size="md">{{ currentQuestion.id }}</TsBadge>
              </div>

              <div class="detail-controls">
                <div class="ctrl-group">
                  <label>题型：</label>
                  <TsSelect
                    :model-value="currentQuestion.type"
                    :options="questionTypeOptions"
                    size="sm"
                    style="min-width: 180px;"
                    @update:model-value="handleQuestionTypeChange"
                  />
                </div>

                <TsSwitch
                  v-model="currentQuestion.required"
                  size="sm"
                  label="必填项"
                  @change="markDirty"
                />
              </div>
            </div>

            <!-- 基础题干与说明 (TsCard) -->
            <TsCard padding="md" class="config-block">
              <div class="form-row">
                <label class="row-label">题目标题</label>
                <TsInput
                  v-model="currentQuestion.title"
                  size="md"
                  bold
                  placeholder="请输入题目内容..."
                  @change="markDirty"
                />
              </div>

              <div class="form-row">
                <label class="row-label">补充说明 (选填)</label>
                <TsTextarea
                  v-model="currentQuestion.description"
                  :rows="2"
                  placeholder="为受访者补充说明作答背景或提示..."
                  @change="markDirty"
                />
              </div>
            </TsCard>

            <!-- 开放问答专属设置 (TsCard + TsInput) -->
            <TsCard
              v-if="currentQuestion.type === 'text_input'"
              padding="md"
              class="config-block"
            >
              <div class="section-title-row">
                <span class="section-title">问答填空专属设置</span>
                <TsBadge variant="warning" size="sm">开放文本题</TsBadge>
              </div>
              <div class="form-row">
                <label class="row-label">输入占位提示语 (Placeholder)</label>
                <TsInput
                  v-model="currentQuestion.placeholder"
                  size="sm"
                  placeholder="例如：请详细阐述您的看法与建议..."
                  @change="markDirty"
                />
              </div>
            </TsCard>

            <!-- 选项列表 (单选/多选/量表) -->
            <TsCard
              v-if="currentQuestion.type !== 'text_input'"
              padding="md"
              class="config-block"
            >
              <div class="section-title-row">
                <div class="options-title-group">
                  <span class="section-title">选项设置</span>
                  <TsBadge
                    v-if="currentQuestion.type === 'multiple_choice'"
                    variant="info"
                    size="sm"
                  >
                    多选题模式
                  </TsBadge>
                  <TsBadge
                    v-else-if="currentQuestion.type === 'likert_scale'"
                    variant="success"
                    size="sm"
                  >
                    量表评分模式
                  </TsBadge>
                </div>
                <TsButton variant="secondary" size="xs" @click="addOption">
                  <Plus style="width: 12px; height: 12px;" />
                  <span>增加选项</span>
                </TsButton>
              </div>

              <!-- 量表题专属快捷预设 -->
              <div v-if="currentQuestion.type === 'likert_scale'" class="likert-preset-bar">
                <span class="preset-label">快捷量表模板：</span>
                <div class="preset-buttons">
                  <TsButton variant="secondary" size="xs" @click="applyLikertPreset('satisfaction')">
                    5点满意度
                  </TsButton>
                  <TsButton variant="secondary" size="xs" @click="applyLikertPreset('agreement')">
                    5点认同度
                  </TsButton>
                  <TsButton variant="secondary" size="xs" @click="applyLikertPreset('frequency')">
                    5点频次
                  </TsButton>
                  <TsButton variant="secondary" size="xs" @click="applyLikertPreset('score')">
                    5分制
                  </TsButton>
                </div>
              </div>

              <div class="options-container">
                <div
                  v-for="(opt, oIdx) in currentQuestion.options || []"
                  :key="oIdx"
                  class="option-item"
                >
                  <span class="opt-alpha">{{ String.fromCharCode(65 + oIdx) }}</span>
                  <TsInput
                    :model-value="typeof opt === 'string' ? opt : opt.label"
                    size="sm"
                    placeholder="输入选项内容..."
                    @update:model-value="(val) => updateOptionText(oIdx, val)"
                  />
                  <TsButton
                    variant="ghost"
                    size="xs"
                    class="btn-danger"
                    title="删除此选项"
                    @click="removeOption(oIdx)"
                  >
                    <Trash2 style="width: 13px; height: 13px;" />
                  </TsButton>
                </div>
              </div>
            </TsCard>

            <!-- 条件跳转流向规则 (TsCard + TsSelect) -->
            <TsCard padding="md" highlight class="config-block">
              <div class="section-title-row">
                <div class="jump-heading">
                  <GitBranch style="width: 15px; height: 15px; color: #4f46e5;" />
                  <span class="section-title">条件跳转流向 (Jump Logic)</span>
                </div>
                <TsButton variant="secondary" size="xs" @click="addJumpRule">
                  <Plus style="width: 12px; height: 12px;" />
                  <span>添加条件跳转</span>
                </TsButton>
              </div>

              <!-- 未配置跳转规则 -->
              <div
                v-if="getConditionalJumpRules().length === 0"
                class="jump-empty"
              >
                当前题目未配置跳转规则，答题后将自然流转到下一题。
              </div>

              <!-- 仅渲染具体的选项条件跳转规则 -->
              <div v-else class="rules-list">
                <div
                  v-for="(rule, rIdx) in getConditionalJumpRules()"
                  :key="rIdx"
                  class="rule-row"
                >
                  <div class="rule-clause">
                    <div class="when-wrap">
                      <span class="clause-text">若受访者选择</span>
                      <TsSelect
                        :model-value="rule.when ? rule.when[currentQuestion.id] : 0"
                        :options="getQuestionOptionChoices()"
                        size="sm"
                        style="min-width: 160px;"
                        @update:model-value="(val) => {
                          if (!rule.when) rule.when = {};
                          rule.when[currentQuestion.id] = Number(val);
                          markDirty();
                        }"
                      />
                    </div>
                  </div>

                  <span class="rule-arrow">➔</span>

                  <div class="rule-dest">
                    <span class="clause-text">跳转至</span>
                    <TsSelect
                      v-model="rule.to"
                      :options="jumpTargetOptions"
                      highlight
                      size="sm"
                      style="min-width: 180px;"
                      @change="markDirty"
                    />
                  </div>

                  <TsButton
                    variant="ghost"
                    size="xs"
                    class="btn-danger"
                    title="删除此规则"
                    @click="removeJumpRule(rule)"
                  >
                    <Trash2 style="width: 13px; height: 13px;" />
                  </TsButton>
                </div>
              </div>
            </TsCard>
          </div>
        </section>
      </div>
    </main>

    <!-- 保存成功提示 Toast -->
    <div v-if="saveSuccessToast" class="toast-box">
      <Check style="width: 14px; height: 14px; color: #10b981;" />
      <span>问卷改动已持久化保存至 SQLite 数据库</span>
    </div>
  </div>
</template>

<style scoped>
.studio-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  color: #0f172a;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* 顶栏 */
.studio-header {
  height: 52px;
  background: #ffffff;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 20;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-name {
  font-size: 0.92rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.divider-v {
  width: 1px;
  height: 16px;
  background: rgba(15, 23, 42, 0.1);
}

.title-area {
  display: flex;
  align-items: center;
}

.title-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.title-display:hover {
  background: #f1f5f9;
}

.title-text {
  font-size: 0.88rem;
  font-weight: 600;
  color: #1e293b;
  max-width: 280px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-center {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 工作区 */
.studio-body {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.state-stage {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #64748b;
  font-size: 0.9rem;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(79, 70, 229, 0.2);
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.flow-stage {
  width: 100%;
  height: 100%;
}

/* 双栏模式 */
.editor-stage {
  display: grid;
  grid-template-columns: 290px 1fr;
  height: 100%;
}

.outline-col {
  background: #ffffff;
  border-right: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.outline-head {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.outline-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.outline-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
}

.outline-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.outline-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.14s;
}

.outline-node:hover {
  background: #f8fafc;
}

.outline-node.selected {
  background: #eef2ff;
  border-color: rgba(79, 70, 229, 0.25);
}

.node-left {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.node-seq {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
}

.node-title {
  font-size: 0.8rem;
  color: #1e293b;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}

.node-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.node-jump-flag {
  font-size: 0.72rem;
  color: #eab308;
  margin-right: 2px;
}

.action-mini-btn {
  padding: 0 4px !important;
  height: 22px !important;
  color: #94a3b8 !important;
}

.action-mini-btn:hover {
  color: #0f172a !important;
}

.btn-danger:hover {
  color: #dc2626 !important;
}

/* 右侧属性面板 */
.inspector-col {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
  background: #f8fafc;
}

.inspector-wrapper {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-q-tag {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}

.detail-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ctrl-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: #475569;
}

.config-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #1e293b;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}

.options-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.likert-preset-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed rgba(15, 23, 42, 0.12);
  margin-bottom: 6px;
}

.preset-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  flex-shrink: 0;
}

.preset-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.options-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.opt-alpha {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  width: 18px;
  text-align: center;
}

.jump-heading {
  display: flex;
  align-items: center;
  gap: 6px;
}

.jump-empty {
  padding: 10px;
  background: #f8fafc;
  border-radius: 6px;
  color: #64748b;
  font-size: 0.78rem;
  text-align: center;
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: #ffffff;
  border: 1px solid rgba(79, 70, 229, 0.15);
  border-radius: 8px;
}

.rule-clause {
  display: flex;
  align-items: center;
  gap: 6px;
}

.when-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clause-text {
  font-size: 0.76rem;
  color: #64748b;
  white-space: nowrap;
}

.rule-arrow {
  color: #94a3b8;
  font-size: 0.82rem;
  font-weight: 700;
}

.rule-dest {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toast-box {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #ffffff;
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #065f46;
  padding: 8px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.1);
  z-index: 999;
}
</style>
