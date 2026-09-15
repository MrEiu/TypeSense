<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { NModal, NSpin, NInput, NButton, NAlert } from 'naive-ui';
import { Sparkles, Send, CheckCircle2, X } from 'lucide-vue-next';
import type {
  QuestionnaireModel,
  QuestionAnswerMap,
} from '../../schema/questionnaire-schema-types';

export interface ExtractedAnswerUpdate {
  question_id: string;
  question_title: string;
  answer: any;
  display_text: string;
  confidence: number;
  evidence: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'ask' | 'fill' | 'confirm' | 'finish';
  updates?: ExtractedAnswerUpdate[];
}

const props = defineProps<{
  show: boolean;
  survey: QuestionnaireModel;
  initialAnswers: QuestionAnswerMap;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'syncAnswers', answers: QuestionAnswerMap, newCount: number): void;
  (e: 'finish', count: number): void;
}>();

const messages = ref<ChatMessage[]>([]);
const userInput = ref('');
const sending = ref(false);
const loadingOpening = ref(false);
const errorMsg = ref<string | null>(null);
const chatScrollRef = ref<HTMLElement | null>(null);

// Strategy mapping & state
const activeStrategyId = ref<string>(props.survey.aiStrategy || 'natural');

const STRATEGY_INFO_MAP: Record<string, { label: string; desc: string }> = {
  natural: { label: '🍃 自然引导', desc: '围绕调研目标自然交流，获知关键点后收束' },
  deep: { label: '🔍 深度追问', desc: '溯源因果链路与深层动因，设有限度熔断' },
  batch: { label: '⚡ 高效聚合', desc: '题目聚类打包，一揽子多指标抽取' },
  evidence: { label: '🛡️ 证据优先', desc: '严格事实依据驱动，三阶置信度门限' },
  adaptive: { label: '🧭 探索式适配', desc: '智能策略路由，自适应受访表达风格' },
};

const currentStrategyInfo = computed(() => {
  return STRATEGY_INFO_MAP[activeStrategyId.value] || STRATEGY_INFO_MAP.natural;
});

// In-session accumulated answers
const sessionAnswers = ref<QuestionAnswerMap>({});
const newlyRecordedMap = ref<Record<string, ExtractedAnswerUpdate>>({});

// Newly extracted items count during this chat session
const newlyExtractedCount = computed(() => Object.keys(newlyRecordedMap.value).length);

// Watch modal visibility
watch(
  () => props.show,
  (val) => {
    if (val) {
      // Initialize state with current survey answers and strategy
      sessionAnswers.value = { ...props.initialAnswers };
      newlyRecordedMap.value = {};
      errorMsg.value = null;
      activeStrategyId.value = props.survey.aiStrategy || 'natural';

      // If first time open, fetch opening welcome prompt
      if (messages.value.length === 0) {
        fetchOpeningPrompt();
      } else {
        scrollToBottom();
      }
    }
  }
);

function scrollToBottom() {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
    }
  });
}

// Fetch natural opening prompt (messages: [])
async function fetchOpeningPrompt() {
  loadingOpening.value = true;
  errorMsg.value = null;

  try {
    const resp = await fetch(`/api/surveys/${encodeURIComponent(props.survey.id)}/ai-chat-fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentAnswers: sessionAnswers.value,
        messages: [],
        strategy: activeStrategyId.value,
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || '获取 AI 引导语失败');
    }

    if (data.metadata?.strategyId) {
      activeStrategyId.value = data.metadata.strategyId;
    }

    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: data.reply,
      type: data.type,
    });
    scrollToBottom();
  } catch (err: any) {
    errorMsg.value = err.message || '连接 AI 助手异常，请稍后重试';
    // Fallback opening if offline or error
    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `你好！这份问卷主要了解关于「${props.survey.title}」的情况。你可以先直接说说你的主要情况，想到什么说什么即可~`,
    });
  } finally {
    loadingOpening.value = false;
  }
}

// Send user message
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || sending.value) return;

  userInput.value = '';
  errorMsg.value = null;

  // Append user message
  messages.value.push({
    id: `msg-u-${Date.now()}`,
    role: 'user',
    content: text,
  });
  scrollToBottom();

  sending.value = true;

  try {
    // Format message history
    const historyPayload = messages.value.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const resp = await fetch(`/api/surveys/${encodeURIComponent(props.survey.id)}/ai-chat-fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentAnswers: sessionAnswers.value,
        messages: historyPayload,
        strategy: activeStrategyId.value,
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || 'AI 回复异常');
    }

    if (data.metadata?.strategyId) {
      activeStrategyId.value = data.metadata.strategyId;
    }

    const updates: ExtractedAnswerUpdate[] = Array.isArray(data.updates) ? data.updates : [];

    // Incrementally merge verified updates into session answers
    for (const u of updates) {
      sessionAnswers.value[u.question_id] = u.answer;
      newlyRecordedMap.value[u.question_id] = u;
    }

    // Real-time synchronization to host survey
    if (updates.length > 0) {
      emit('syncAnswers', { ...sessionAnswers.value }, newlyExtractedCount.value);
    }

    messages.value.push({
      id: `msg-a-${Date.now()}`,
      role: 'assistant',
      content: data.reply || '已为你记录。请继续聊聊，或随时点击右上角完成。',
      type: data.type,
      updates: updates.length > 0 ? updates : undefined,
    });
    scrollToBottom();
  } catch (err: any) {
    errorMsg.value = err.message || '网络通讯异常，请重试';
  } finally {
    sending.value = false;
  }
}

function handleQuickConfirm(confirmed: boolean) {
  if (sending.value) return;
  if (confirmed) {
    userInput.value = '确认记录正确';
    handleSend();
  } else {
    userInput.value = '需要更正：';
  }
}

// Complete conversation and sync answers back to survey
function handleFinishAndSync() {
  emit('syncAnswers', { ...sessionAnswers.value }, newlyExtractedCount.value);
  emit('finish', newlyExtractedCount.value);
  emit('update:show', false);
}

// Cancel / close
function handleClose() {
  if (newlyExtractedCount.value > 0) {
    handleFinishAndSync();
  } else {
    emit('update:show', false);
  }
}

function handleModalVisibilityChange(val: boolean) {
  if (!val) {
    if (newlyExtractedCount.value > 0) {
      emit('syncAnswers', { ...sessionAnswers.value }, newlyExtractedCount.value);
      emit('finish', newlyExtractedCount.value);
    }
    emit('update:show', false);
  } else {
    emit('update:show', true);
  }
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="false"
    preset="card"
    class="ai-chat-filler-modal"
    style="width: 94vw; max-width: 680px; height: 85vh; max-height: 820px; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden;"
    content-style="display: flex; flex-direction: column; height: 100%; padding: 0; overflow: hidden;"
    @update:show="handleModalVisibilityChange"
  >
    <!-- Modal Custom Header -->
    <template #header>
      <div class="chat-header-bar">
        <div class="header-left">
          <div class="header-icon-badge">
            <Sparkles class="w-4 h-4 text-indigo-600" />
          </div>
          <div class="header-info">
            <div class="header-title-row">
              <h3 class="header-title">AI 对话速填</h3>
              <span class="strategy-badge" :title="currentStrategyInfo.desc">
                {{ currentStrategyInfo.label }}
              </span>
            </div>
            <span class="header-subtitle">{{ currentStrategyInfo.desc }}</span>
          </div>
        </div>

        <div class="header-right">
          <!-- Non-pressuring record counter -->
          <span v-if="newlyExtractedCount > 0" class="record-badge active">
            <CheckCircle2 class="w-3.5 h-3.5" />
            已记录 {{ newlyExtractedCount }} 项
          </span>
          <span v-else class="record-badge idle">
            随心交流
          </span>

          <NButton
            type="primary"
            size="small"
            class="finish-btn"
            @click="handleFinishAndSync"
          >
            完成交谈
          </NButton>

          <button class="close-icon-btn" title="退出" @click="handleClose">
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </template>

    <!-- Error bar if any -->
    <NAlert v-if="errorMsg" type="error" :bordered="false" closable class="chat-error-alert" @close="errorMsg = null">
      {{ errorMsg }}
    </NAlert>

    <!-- Chat Messages Scroll Area -->
    <div ref="chatScrollRef" class="chat-messages-container">
      <!-- Loading opening prompt skeleton -->
      <div v-if="loadingOpening" class="chat-loading-state">
        <NSpin size="small" />
        <span class="loading-text">正在准备交流引导...</span>
      </div>

      <!-- Messages Stream -->
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="['message-row', msg.role === 'user' ? 'user-row' : 'assistant-row']"
      >
        <div v-if="msg.role === 'assistant'" class="bot-avatar">
          ⚡
        </div>

        <div class="message-bubble-wrap">
          <div class="message-bubble">
            {{ msg.content }}
          </div>

          <!-- Quick confirmation bar if confirm type -->
          <div v-if="msg.type === 'confirm'" class="confirm-action-bar">
            <button class="confirm-act-btn primary" @click="handleQuickConfirm(true)">确认无误</button>
            <button class="confirm-act-btn secondary" @click="handleQuickConfirm(false)">补充更正</button>
          </div>

          <!-- Inline extraction feedback badges -->
          <div v-if="msg.updates && msg.updates.length > 0" class="extracted-tags-wrap">
            <div
              v-for="upd in msg.updates"
              :key="upd.question_id"
              class="extracted-tag-item"
              :title="`依据：${upd.evidence || '用户表述'}`"
            >
              <span class="tag-spark">✓</span>
              <span class="tag-label">已记录：{{ upd.question_title }}</span>
              <span class="tag-val">({{ upd.display_text }})</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Assistant thinking / sending indicator -->
      <div v-if="sending" class="message-row assistant-row">
        <div class="bot-avatar">⚡</div>
        <div class="message-bubble-wrap">
          <div class="message-bubble typing-bubble">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Input Bar -->
    <div class="chat-footer-bar">
      <div class="input-form-wrap">
        <NInput
          v-model:value="userInput"
          type="text"
          placeholder="输入你的情况或直接回答..."
          size="large"
          :disabled="sending || loadingOpening"
          @keyup.enter="handleSend"
        />
        <NButton
          type="primary"
          size="large"
          class="send-btn"
          :disabled="!userInput.trim() || sending || loadingOpening"
          :loading="sending"
          @click="handleSend"
        >
          <template #icon>
            <Send class="w-4 h-4" />
          </template>
        </NButton>
      </div>
      <div class="footer-hint">
        点击右上角随时完成交谈，已记录内容将自动同步至问卷
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.chat-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon-badge {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(79, 70, 229, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
}

:root.dark .header-title {
  color: #f8fafc;
}

.strategy-badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
  border: 1px solid rgba(99, 102, 241, 0.25);
  cursor: default;
}

:root.dark .strategy-badge {
  background: rgba(99, 102, 241, 0.25);
  color: #a5b4fc;
}

.header-subtitle {
  font-size: 0.75rem;
  color: #64748b;
  display: block;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.record-badge {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.record-badge.active {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.record-badge.idle {
  background: rgba(100, 116, 139, 0.1);
  color: #64748b;
}

.finish-btn {
  font-weight: 600;
  border-radius: 8px;
}

.close-icon-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s;
}

.close-icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #475569;
}

.chat-error-alert {
  margin: 8px 16px;
  border-radius: 8px;
}

.chat-messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #fafafa;
}

:root.dark .chat-messages-container {
  background: #0b0f19;
}

.chat-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  color: #64748b;
  font-size: 0.85rem;
}

.message-row {
  display: flex;
  gap: 10px;
  max-width: 85%;
}

.user-row {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.assistant-row {
  align-self: flex-start;
}

.bot-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #4f46e5;
  color: #fff;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
}

.message-bubble-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 0.92rem;
  line-height: 1.5;
  word-break: break-word;
}

.assistant-row .message-bubble {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-top-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.dark .assistant-row .message-bubble {
  background: #1e293b;
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.08);
}

.user-row .message-bubble {
  background: #4f46e5;
  color: #ffffff;
  border-top-right-radius: 4px;
}

.confirm-action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.confirm-act-btn {
  font-size: 0.76rem;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.confirm-act-btn.primary {
  background: #4f46e5;
  color: #ffffff;
  border-color: #4f46e5;
}

.confirm-act-btn.primary:hover {
  background: #4338ca;
}

.confirm-act-btn.secondary {
  background: #f1f5f9;
  color: #475569;
  border-color: #cbd5e1;
}

:root.dark .confirm-act-btn.secondary {
  background: #1e293b;
  color: #94a3b8;
  border-color: #334155;
}

.extracted-tags-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
}

.extracted-tag-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  font-size: 0.78rem;
  padding: 4px 10px;
  border-radius: 8px;
}

:root.dark .extracted-tag-item {
  background: rgba(6, 95, 70, 0.2);
  border-color: rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
}

.tag-spark {
  font-weight: bold;
  color: #10b981;
}

.tag-label {
  font-weight: 600;
}

.tag-val {
  color: #047857;
}

:root.dark .tag-val {
  color: #a7f3d0;
}

.typing-bubble {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  background: #94a3b8;
  border-radius: 50%;
  animation: typingBounce 1.4s infinite ease-in-out both;
}

.typing-dot:nth-child(1) {
  animation-delay: -0.32s;
}
.typing-dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes typingBounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.chat-footer-bar {
  padding: 12px 18px;
  background: #ffffff;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:root.dark .chat-footer-bar {
  background: #111827;
  border-top-color: rgba(255, 255, 255, 0.08);
}

.input-form-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.send-btn {
  border-radius: 10px;
  flex-shrink: 0;
}

.footer-hint {
  font-size: 0.72rem;
  color: #94a3b8;
  text-align: center;
}
</style>
