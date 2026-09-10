<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
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

// 动态状态 (绝无前端写死数据)
const isLoading = ref(true);
const isSaving = ref(false);
const saveSuccessToast = ref(false);
const isDirty = ref(false);
const currentSurveyId = ref('');
const questionnaire = ref<QuestionnaireModel | null>(null);
const allSurveys = ref<Array<{ id: string; title: string; slug?: string }>>([]);

// 视图模式: 'flow' 流程拓扑 | 'editor' 题目与逻辑编排
const viewMode = ref<'flow' | 'editor'>('editor');

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

// 从后端真实拉取问卷
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
function handleSurveySelect(e: Event) {
  const target = e.target as HTMLSelectElement;
  if (target?.value) {
    loadSurvey(target.value);
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

// 跳转逻辑规则 (仅关注具体选项条件跳转 when，忽略无意义的 else 兜底)
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
  // 清理空规则
  if (currentQuestion.value.jump.length === 0) {
    delete currentQuestion.value.jump;
  }
  markDirty();
}

function markDirty() {
  isDirty.value = true;
}

// 保存问卷到后端数据库
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
      return '单选题';
    case 'multiple_choice':
      return '多选题';
    case 'likert_scale':
      return '量表题';
    case 'text_input':
      return '填空题';
    default:
      return '题目';
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
    console.error('[Studio] 初始化加载问卷失败:', err);
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
        <a href="/" class="back-link" title="返回控制台">
          <ArrowLeft style="width: 15px; height: 15px;" />
        </a>

        <div class="brand-group">
          <span class="brand-tag">STUDIO</span>
          <span class="brand-name">TypeSense</span>
        </div>

        <div class="divider-v"></div>

        <!-- 问卷标题 (动态) -->
        <div v-if="questionnaire" class="title-area">
          <div v-if="!isEditingTitle" class="title-display" @click="startEditTitle" title="点击编辑问卷标题">
            <span class="title-text">{{ questionnaire.title }}</span>
            <Edit3 style="width: 13px; height: 13px; opacity: 0.6;" />
          </div>
          <input
            v-else
            v-model="tempTitle"
            class="title-input"
            autofocus
            @blur="finishEditTitle"
            @keyup.enter="finishEditTitle"
          />
        </div>
      </div>

      <!-- 中心视图模式切换 -->
      <div class="header-center">
        <div class="segmented-control">
          <button
            class="segment-btn"
            :class="{ active: viewMode === 'editor' }"
            @click="viewMode = 'editor'"
          >
            <ListOrdered style="width: 14px; height: 14px;" />
            <span>逻辑编排</span>
          </button>

          <button
            class="segment-btn"
            :class="{ active: viewMode === 'flow' }"
            @click="viewMode = 'flow'"
          >
            <GitBranch style="width: 14px; height: 14px;" />
            <span>流程拓扑</span>
          </button>
        </div>
      </div>

      <!-- 右侧操作 -->
      <div class="header-right">
        <!-- 切换问卷 -->
        <select
          v-if="allSurveys.length > 1"
          class="survey-select"
          :value="currentSurveyId"
          @change="handleSurveySelect"
        >
          <option v-for="s in allSurveys" :key="s.id" :value="s.id">
            {{ s.title }}
          </option>
        </select>

        <!-- 保存按钮 -->
        <button
          v-if="questionnaire"
          class="save-btn"
          :class="{ 'is-dirty': isDirty }"
          :disabled="isSaving"
          @click="handleSave"
        >
          <Save style="width: 14px; height: 14px;" />
          <span>{{ isSaving ? '保存中...' : isDirty ? '保存改动 *' : '已保存' }}</span>
        </button>

        <!-- 受访体验 -->
        <a
          v-if="questionnaire"
          :href="respondentUrl"
          target="_blank"
          class="preview-link"
          title="在新标签页体验真实作答"
        >
          <ExternalLink style="width: 14px; height: 14px;" />
          <span>受访体验</span>
        </a>
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
        <AlertCircle style="width: 40px; height: 40px; color: #94a3b8;" />
        <h3>未找到对应的问卷数据</h3>
        <p>请确认问卷 ID 是否正确，或返回控制台选择问卷进行编排。</p>
        <a href="/" class="empty-back-btn">← 返回问卷控制台</a>
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
              <span class="outline-badge">{{ questionnaire.questions.length }} 题</span>
            </div>
            <button class="add-btn" @click="addQuestion('single_choice')">
              <Plus style="width: 13px; height: 13px;" />
              <span>添加题目</span>
            </button>
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
                <span class="node-type" :class="q.type">{{ getQuestionTypeName(q.type) }}</span>
                <span class="node-title" :title="q.title">{{ q.title }}</span>
              </div>

              <div class="node-actions" @click.stop>
                <span v-if="q.jump" class="node-jump-flag" title="包含分支跳转规则">⚡</span>
                <button
                  class="action-icon"
                  :disabled="idx === 0"
                  title="上移"
                  @click="moveQuestion(idx, 'up')"
                >
                  <ChevronUp style="width: 12px; height: 12px;" />
                </button>
                <button
                  class="action-icon"
                  :disabled="idx === questionnaire.questions.length - 1"
                  title="下移"
                  @click="moveQuestion(idx, 'down')"
                >
                  <ChevronDown style="width: 12px; height: 12px;" />
                </button>
                <button class="action-icon" title="复制" @click="duplicateQuestion(idx)">
                  <Copy style="width: 12px; height: 12px;" />
                </button>
                <button class="action-icon danger" title="删除" @click="deleteQuestion(idx)">
                  <Trash2 style="width: 12px; height: 12px;" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <!-- 右侧题目属性与逻辑配置区 -->
        <section class="inspector-col">
          <div v-if="currentQuestion" class="inspector-wrapper">
            <!-- 题目顶部摘要条 -->
            <div class="detail-header">
              <div class="detail-meta">
                <span class="detail-q-tag">第 {{ activeQuestionIndex + 1 }} 题</span>
                <span class="detail-q-id">{{ currentQuestion.id }}</span>
              </div>

              <div class="detail-controls">
                <div class="ctrl-group">
                  <label>题型：</label>
                  <select
                    v-model="currentQuestion.type"
                    class="studio-select"
                    @change="markDirty"
                  >
                    <option value="single_choice">单选题</option>
                    <option value="multiple_choice">多选题</option>
                    <option value="likert_scale">量表评分题</option>
                    <option value="text_input">开放问答</option>
                  </select>
                </div>

                <label class="toggle-box">
                  <input
                    type="checkbox"
                    v-model="currentQuestion.required"
                    @change="markDirty"
                  />
                  <span>必填</span>
                </label>
              </div>
            </div>

            <!-- 基础题干与说明 -->
            <div class="form-section">
              <div class="form-row">
                <label class="row-label">题目标题</label>
                <input
                  v-model="currentQuestion.title"
                  type="text"
                  class="studio-input strong"
                  placeholder="请输入题目内容..."
                  @input="markDirty"
                />
              </div>

              <div class="form-row">
                <label class="row-label">补充说明 (选填)</label>
                <textarea
                  v-model="currentQuestion.description"
                  class="studio-textarea"
                  rows="2"
                  placeholder="为受访者补充说明作答背景或提示..."
                  @input="markDirty"
                ></textarea>
              </div>
            </div>

            <!-- 选项列表 (单选/多选/量表) -->
            <div
              v-if="currentQuestion.type !== 'text_input'"
              class="form-section"
            >
              <div class="section-title-row">
                <span class="section-title">选项设置</span>
                <button class="small-btn" @click="addOption">
                  <Plus style="width: 12px; height: 12px;" />
                  <span>增加选项</span>
                </button>
              </div>

              <div class="options-container">
                <div
                  v-for="(opt, oIdx) in currentQuestion.options || []"
                  :key="oIdx"
                  class="option-item"
                >
                  <span class="opt-alpha">{{ String.fromCharCode(65 + oIdx) }}</span>
                  <input
                    type="text"
                    :value="typeof opt === 'string' ? opt : opt.label"
                    class="studio-input opt-text"
                    placeholder="输入选项内容..."
                    @input="(e) => updateOptionText(oIdx, (e.target as HTMLInputElement).value)"
                  />
                  <button
                    class="action-icon danger"
                    title="删除此选项"
                    @click="removeOption(oIdx)"
                  >
                    <Trash2 style="width: 13px; height: 13px;" />
                  </button>
                </div>
              </div>
            </div>

            <!-- 可视化跳转流向规则 (Jump Logic) -->
            <div class="form-section jump-section">
              <div class="section-title-row">
                <div class="jump-heading">
                  <GitBranch style="width: 15px; height: 15px; color: #4f46e5;" />
                  <span class="section-title">条件跳转流向 (Jump Logic)</span>
                </div>
                <div class="jump-actions">
                  <button class="small-btn" @click="addJumpRule">
                    <Plus style="width: 12px; height: 12px;" />
                    <span>添加条件跳转</span>
                  </button>
                </div>
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
                      <select
                        class="studio-select compact"
                        :value="rule.when ? rule.when[currentQuestion.id] : 0"
                        @change="(e) => {
                          if (!rule.when) rule.when = {};
                          rule.when[currentQuestion.id] = Number((e.target as HTMLSelectElement).value);
                          markDirty();
                        }"
                      >
                        <option
                          v-for="(opt, optI) in currentQuestion.options || []"
                          :key="optI"
                          :value="optI"
                        >
                          选项 {{ String.fromCharCode(65 + optI) }}: {{ typeof opt === 'string' ? opt : opt.label }}
                        </option>
                      </select>
                    </div>
                  </div>

                  <span class="rule-arrow">➔</span>

                  <div class="rule-dest">
                    <span class="clause-text">跳转至</span>
                    <select
                      v-model="rule.to"
                      class="studio-select compact target"
                      @change="markDirty"
                    >
                      <option
                        v-for="(targetQ, targetI) in questionnaire.questions"
                        :key="targetQ.id"
                        :value="targetQ.id"
                      >
                        Q{{ targetI + 1 }}: {{ targetQ.title }}
                      </option>
                      <option value="end">🏁 正常结束作答 (End)</option>
                      <option value="exit">🚫 甄别淘汰终止 (Exit)</option>
                    </select>
                  </div>

                  <button
                    class="action-icon danger"
                    title="删除此规则"
                    @click="removeJumpRule(rule)"
                  >
                    <Trash2 style="width: 13px; height: 13px;" />
                  </button>
                </div>
              </div>
            </div>
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
  height: 54px;
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

.back-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  text-decoration: none;
  transition: all 0.15s;
}

.back-link:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  font-weight: 800;
  background: #eef2ff;
  color: #4f46e5;
  padding: 2px 5px;
  border-radius: 4px;
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

.title-input {
  font-size: 0.88rem;
  font-weight: 600;
  color: #0f172a;
  border: 1px solid #4f46e5;
  border-radius: 6px;
  padding: 3px 8px;
  outline: none;
  background: #ffffff;
}

/* 切换器 */
.header-center {
  display: flex;
  align-items: center;
}

.segmented-control {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.segment-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.segment-btn:hover {
  color: #0f172a;
}

.segment-btn.active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

/* 右侧 */
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.survey-select {
  height: 30px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  padding: 0 8px;
  font-size: 0.78rem;
  background: #ffffff;
  color: #334155;
  outline: none;
  cursor: pointer;
}

.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.save-btn.is-dirty {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #ffffff;
  box-shadow: 0 2px 5px rgba(79, 70, 229, 0.25);
}

.preview-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #f8fafc;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s;
}

.preview-link:hover {
  background: #e2e8f0;
  color: #0f172a;
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

.empty-back-btn {
  margin-top: 8px;
  padding: 6px 14px;
  background: #4f46e5;
  color: #ffffff;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 600;
}

.spinner {
  width: 30px;
  height: 30px;
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

/* 经典双栏大纲与属性编辑器 */
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

.outline-badge {
  font-size: 0.72rem;
  background: #f1f5f9;
  color: #64748b;
  padding: 1px 5px;
  border-radius: 4px;
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #eef2ff;
  border: 1px solid rgba(79, 70, 229, 0.25);
  border-radius: 6px;
  color: #4f46e5;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.add-btn:hover {
  background: #e0e7ff;
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
  padding: 8px 10px;
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

.node-type {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
}

.node-type.single_choice {
  background: #eef2ff;
  color: #4f46e5;
}

.node-type.multiple_choice {
  background: #e0f2fe;
  color: #0284c7;
}

.node-type.likert_scale {
  background: #ecfdf5;
  color: #059669;
}

.node-type.text_input {
  background: #faf5ff;
  color: #9333ea;
}

.node-title {
  font-size: 0.8rem;
  color: #1e293b;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
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

.action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.12s;
}

.action-icon:hover:not(:disabled) {
  background: #e2e8f0;
  color: #0f172a;
}

.action-icon.danger:hover:not(:disabled) {
  background: #fee2e2;
  color: #ef4444;
}

.action-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
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

.detail-q-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  background: #e2e8f0;
  color: #475569;
  padding: 2px 6px;
  border-radius: 4px;
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

.toggle-box {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.form-section {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-section.jump-section {
  border-color: rgba(79, 70, 229, 0.25);
  background: #fafbff;
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

.studio-input {
  height: 34px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  padding: 0 10px;
  font-size: 0.85rem;
  color: #0f172a;
  outline: none;
  background: #ffffff;
  transition: border-color 0.15s;
}

.studio-input.strong {
  font-size: 0.95rem;
  font-weight: 600;
}

.studio-input:focus {
  border-color: #4f46e5;
}

.studio-textarea {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.82rem;
  color: #0f172a;
  outline: none;
  resize: vertical;
  background: #ffffff;
}

.studio-textarea:focus {
  border-color: #4f46e5;
}

.studio-select {
  height: 30px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  padding: 0 8px;
  font-size: 0.8rem;
  background: #ffffff;
  color: #334155;
  outline: none;
  cursor: pointer;
}

.studio-select.compact {
  height: 28px;
  font-size: 0.78rem;
}

.studio-select.target {
  border-color: #4f46e5;
  color: #4f46e5;
  font-weight: 600;
}

.small-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #ffffff;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.small-btn:hover {
  background: #f1f5f9;
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

.opt-text {
  flex: 1;
}

.jump-heading {
  display: flex;
  align-items: center;
  gap: 6px;
}

.jump-actions {
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
  border-radius: 6px;
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
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.1);
  z-index: 999;
}
</style>
