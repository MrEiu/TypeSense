<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  NModal,
  NCard,
  NButton,
  NInput,
  NSpace,
  NTag,
  NSpin,
  useMessage,
  NCollapse,
  NCollapseItem,
} from 'naive-ui';
import {
  Sparkles,
  Send,
  Check,
  RotateCcw,
  Eye,
  FileText,
  AlertCircle,
  PlusCircle,
  Edit3,
  Trash2,
  Layers,
  ArrowRight,
} from 'lucide-vue-next';
import {
  AiEditorClientService,
  type EditorSessionData,
  type SurveyDiffSummary,
  type ChatMessage,
} from '../../services/ai-editor-service';
import type { QuestionnaireModel, QuestionItemModel } from '../../schema/questionnaire-schema-types';
import type { SurveyMetadataItem } from '../../services/questionnaire-repository-service';
import { marked } from 'marked';

function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    return marked.parse(content, { gfm: true, breaks: true }) as string;
  } catch {
    return content;
  }
}

const props = defineProps<{
  show: boolean;
  survey: SurveyMetadataItem | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'survey-updated', surveyId: string): void;
}>();

const message = useMessage();
const loading = ref(false);
const chatLoading = ref(false);
const applyingLoading = ref(false);

const session = ref<EditorSessionData | null>(null);
const activeViewVersion = ref<'working' | 'original'>('working');
const userPromptInput = ref('');

const currentSurveyModel = computed<QuestionnaireModel | null>(() => {
  if (!session.value) return null;
  return activeViewVersion.value === 'working'
    ? session.value.workingSurvey
    : session.value.originalSurvey;
});

const diffSummary = computed<SurveyDiffSummary>(() => {
  return session.value?.diff || {
    addedCount: 0,
    modifiedCount: 0,
    deletedCount: 0,
    titleChanged: false,
    descriptionChanged: false,
    changes: [],
    hasChanges: false,
  };
});

watch(
  () => [props.show, props.survey?.id],
  async ([show, id]) => {
    if (show && id && props.survey) {
      await initSession(props.survey.id);
    } else {
      session.value = null;
      userPromptInput.value = '';
      activeViewVersion.value = 'working';
    }
  }
);

async function initSession(surveyId: string) {
  loading.value = true;
  try {
    const data = await AiEditorClientService.startSession(surveyId);
    session.value = data;
    activeViewVersion.value = 'working';
  } catch (err: any) {
    message.error(err.message || '初始化 AI 编辑会话失败');
    emit('update:show', false);
  } finally {
    loading.value = false;
  }
}

async function handleSendMessage() {
  if (!session.value || !userPromptInput.value.trim() || chatLoading.value) return;

  const promptText = userPromptInput.value.trim();
  userPromptInput.value = '';
  chatLoading.value = true;

  try {
    const res = await AiEditorClientService.sendChat(session.value.sessionId, promptText);
    session.value.workingSurvey = res.workingSurvey;
    session.value.chatHistory = res.chatHistory;
    session.value.diff = res.diff;
    activeViewVersion.value = 'working';
    message.success('AI 局部修改完成，请预览比对');
  } catch (err: any) {
    message.error(err.message || 'AI 修改执行失败');
  } finally {
    chatLoading.value = false;
  }
}

async function handleApply() {
  if (!session.value || applyingLoading.value) return;
  applyingLoading.value = true;
  try {
    const res = await AiEditorClientService.applyChanges(session.value.sessionId);
    session.value.originalSurvey = res.appliedSurvey;
    session.value.diff = res.diff;
    message.success('修改已成功采纳并正式存盘！');
    emit('survey-updated', props.survey?.id || '');
    emit('update:show', false);
  } catch (err: any) {
    message.error(err.message || '保存修改失败');
  } finally {
    applyingLoading.value = false;
  }
}

async function handleDiscard() {
  if (!session.value) return;
  try {
    const res = await AiEditorClientService.discardChanges(session.value.sessionId);
    session.value.workingSurvey = res.workingSurvey;
    session.value.diff = res.diff;
    activeViewVersion.value = 'working';
    message.info('已放弃修改并重置为原始版本');
  } catch (err: any) {
    message.error(err.message || '放弃修改失败');
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
      <!-- 顶部状态栏 -->
      <div class="editor-header">
        <div class="header-left">
          <div class="title-badge">
            <Sparkles class="icon-sparkle" :size="18" />
            <span class="title-text">AI 问卷局部智能编辑</span>
          </div>
          <span class="survey-title-label">{{ props.survey?.title || '正在加载问卷...' }}</span>
        </div>

        <!-- 版本切换单选控制器 -->
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

        <!-- 顶部操作与关闭 -->
        <div class="header-right">
          <NButton size="small" quaternary @click="emit('update:show', false)">关闭</NButton>
        </div>
      </div>

      <!-- 差异统计条 (Diff Summary Bar) -->
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
            @click="handleDiscard"
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

      <!-- 主工作区：左侧问卷渲染视图 + 右侧 AI 对话与局部修改面板 -->
      <div class="editor-body">
        <!-- 左侧：问卷实时内容预览 -->
        <div class="survey-preview-panel">
          <div v-if="loading" class="loading-state">
            <NSpin size="large" description="正在载入问卷数据..." />
          </div>

          <div v-else-if="currentSurveyModel" class="survey-content-scroll">
            <div class="survey-meta-header">
              <div class="version-watermark">
                {{ activeViewVersion === 'working' ? '当前工作版本 (Working)' : '原始版本 (Original)' }}
              </div>
              <h2 class="survey-name">{{ currentSurveyModel.title }}</h2>
              <p v-if="currentSurveyModel.description" class="survey-desc">
                {{ currentSurveyModel.description }}
              </p>
            </div>

            <!-- 题目列表 -->
            <div class="questions-list">
              <div
                v-for="(q, index) in currentSurveyModel.questions"
                :key="q.id || index"
                class="question-card"
              >
                <div class="q-header">
                  <span class="q-index">第 {{ index + 1 }} 题 ({{ q.id }})</span>
                  <NTag size="small" :bordered="false" type="info">{{ q.type }}</NTag>
                  <NTag v-if="q.required" size="small" :bordered="false" type="error">必填</NTag>
                </div>
                <div class="q-title">{{ q.title }}</div>

                <!-- 选项列表 -->
                <div v-if="Array.isArray(q.options) && q.options.length > 0" class="q-options-grid">
                  <div
                    v-for="(opt, oIdx) in q.options"
                    :key="oIdx"
                    class="q-option-chip"
                  >
                    <span class="opt-dot"></span>
                    <span class="opt-label">{{ opt }}</span>
                  </div>
                </div>

                <!-- 文本框占位 -->
                <div v-if="q.type === 'text_input'" class="q-text-placeholder">
                  {{ q.placeholder || '用户文本输入区...' }}
                </div>

                <!-- 跳转逻辑提示 -->
                <div v-if="Array.isArray(q.jump) && q.jump.length > 0" class="q-jump-info">
                  <span class="jump-title">跳转规则:</span>
                  <span v-for="(rule, rIdx) in q.jump" :key="rIdx" class="jump-item">
                    {{ rule.else ? '默认' : JSON.stringify(rule.when) }} <ArrowRight :size="10" /> {{ rule.to }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：AI 对话与变更审计 -->
        <div class="ai-chat-panel">
          <!-- 历史对话记录 -->
          <div class="chat-messages-scroll">
            <div class="assistant-welcome">
              <div class="bot-avatar"><Sparkles :size="16" /></div>
              <div class="bot-msg-body">
                您好！我是 <strong>AI 问卷编辑助手</strong>。
                <br />
                您可以告诉我具体的修改需求（例如：“把第 3 题改为 5 级量表”、“删除第 2 题”、“增加一个满意度评分题”），我将通过局部精准替换完成修改。
              </div>
            </div>

            <!-- 对话气泡 -->
            <div
              v-for="msg in session?.chatHistory || []"
              :key="msg.id"
              class="chat-bubble-row"
              :class="msg.role"
            >
              <div class="bubble-avatar">
                <Sparkles v-if="msg.role === 'assistant'" :size="14" />
                <span v-else>我</span>
              </div>
              <div
                v-if="msg.role === 'assistant'"
                class="bubble-content markdown-body"
                v-html="renderMarkdown(msg.content)"
              ></div>
              <div v-else class="bubble-content">
                {{ msg.content }}
              </div>
            </div>

            <div v-if="chatLoading" class="chat-loading-row">
              <NSpin size="small" description="AI 正在读取并精准替换局部区块..." />
            </div>
          </div>

          <!-- 变更详细列表展开折叠 -->
          <div v-if="diffSummary.changes.length > 0" class="diff-changes-drawer">
            <NCollapse>
              <NCollapseItem title="查看本次具体变更清单" name="diff-list">
                <div class="diff-items-list">
                  <div
                    v-for="(item, idx) in diffSummary.changes"
                    :key="idx"
                    class="diff-item-row"
                    :class="item.type"
                  >
                    <NTag size="small" :bordered="false" :type="item.type === 'added' ? 'success' : item.type === 'modified' ? 'warning' : 'error'">
                      {{ item.type === 'added' ? '新增' : item.type === 'modified' ? '修改' : '删除' }}
                    </NTag>
                    <span class="diff-item-title">{{ item.title }}</span>
                    <span class="diff-item-detail">{{ item.detail }}</span>
                  </div>
                </div>
              </NCollapseItem>
            </NCollapse>
          </div>

          <!-- 底部输入框 -->
          <div class="chat-input-row">
            <NInput
              v-model:value="userPromptInput"
              type="textarea"
              :rows="2"
              placeholder="输入修改指令，如：把第 4 题选项改成 5 个，并在最后加一道建议题..."
              :disabled="chatLoading"
              @keydown.enter.prevent="handleSendMessage"
            />
            <NButton
              type="primary"
              class="send-btn"
              :loading="chatLoading"
              :disabled="!userPromptInput.trim()"
              @click="handleSendMessage"
            >
              <template #icon><Send :size="16" /></template>
              发送
            </NButton>
          </div>
        </div>
      </div>
    </NCard>
  </NModal>
</template>

<style scoped>
.ai-editor-card {
  background: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-header {
  height: 56px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #f8fafc;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #4f46e5;
  font-size: 15px;
}

.survey-title-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.version-toggle-group {
  display: flex;
  background: #e2e8f0;
  padding: 3px;
  border-radius: 8px;
  gap: 2px;
}

.toggle-btn {
  border: none;
  background: transparent;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.change-dot {
  width: 6px;
  height: 6px;
  background: #4f46e5;
  border-radius: 50%;
}

.diff-summary-bar {
  height: 44px;
  background: #ffffff;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.diff-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.diff-title {
  font-weight: 600;
  color: #334155;
}

.no-diff-hint {
  color: #94a3b8;
  font-size: 12px;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.survey-preview-panel {
  flex: 1.2;
  border-right: 1px solid rgba(15, 23, 42, 0.08);
  background: #f8fafc;
  overflow-y: auto;
  padding: 24px;
}

.survey-content-scroll {
  max-width: 680px;
  margin: 0 auto;
}

.survey-meta-header {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 18px;
  position: relative;
}

.version-watermark {
  position: absolute;
  top: 14px;
  right: 16px;
  font-size: 11px;
  color: #4f46e5;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.survey-name {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.survey-desc {
  font-size: 13px;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}

.questions-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.question-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 10px;
  padding: 16px;
  transition: box-shadow 0.2s;
}

.question-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.q-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.q-index {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.q-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
}

.q-options-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.q-option-chip {
  background: #f1f5f9;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 6px;
}

.opt-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #64748b;
}

.q-text-placeholder {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #94a3b8;
}

.q-jump-info {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(15, 23, 42, 0.06);
  font-size: 11px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.jump-title {
  font-weight: 600;
}

.jump-item {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ai-chat-panel {
  flex: 0.9;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.chat-messages-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.assistant-welcome {
  display: flex;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.bot-avatar {
  color: #4f46e5;
}

.chat-bubble-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.chat-bubble-row.user {
  flex-direction: row-reverse;
}

.bubble-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  background: #e0e7ff;
  color: #4f46e5;
  flex-shrink: 0;
}

.chat-bubble-row.user .bubble-avatar {
  background: #4f46e5;
  color: #ffffff;
}

.bubble-content {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.chat-bubble-row.assistant .bubble-content {
  background: #f1f5f9;
  color: #1e293b;
}

.chat-bubble-row.assistant .bubble-content.markdown-body {
  white-space: normal;
}

.bubble-content.markdown-body :deep(p) {
  margin: 0 0 6px 0;
}

.bubble-content.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.bubble-content.markdown-body :deep(ul),
.bubble-content.markdown-body :deep(ol) {
  margin: 4px 0 6px 16px;
  padding: 0;
}

.bubble-content.markdown-body :deep(li) {
  margin-bottom: 2px;
}

.bubble-content.markdown-body :deep(code) {
  background: rgba(15, 23, 42, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.bubble-content.markdown-body :deep(pre) {
  background: #0f172a;
  color: #f8fafc;
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 6px 0;
  font-size: 12px;
}

.bubble-content.markdown-body :deep(strong) {
  font-weight: 700;
  color: #0f172a;
}

.chat-bubble-row.user .bubble-content {
  background: #4f46e5;
  color: #ffffff;
}

.chat-loading-row {
  padding: 10px;
  display: flex;
  justify-content: center;
}

.diff-changes-drawer {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  padding: 8px 16px;
  background: #f8fafc;
  max-height: 140px;
  overflow-y: auto;
}

.diff-items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diff-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.diff-item-title {
  font-weight: 600;
  color: #334155;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-item-detail {
  color: #64748b;
  font-size: 11px;
}

.chat-input-row {
  padding: 14px 16px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  gap: 10px;
  background: #ffffff;
}

.send-btn {
  height: auto;
  padding: 0 18px;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}
</style>
