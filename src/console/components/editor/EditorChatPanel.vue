<script setup lang="ts">
/**
 * src/console/components/editor/EditorChatPanel.vue
 *
 * Right panel for AI Survey Editor: Multi-turn chat conversation and detailed diff changes.
 */

import { NInput, NButton, NSpin, NCollapse, NCollapseItem, NTag } from 'naive-ui';
import { Sparkles, Send } from 'lucide-vue-next';
import { marked } from 'marked';
import type { EditorSessionData, SurveyDiffSummary } from '../../../services/ai-editor-service';

defineProps<{
  session: EditorSessionData | null;
  diffSummary: SurveyDiffSummary;
  userPromptInput: string;
  chatLoading: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:userPromptInput', val: string): void;
  (e: 'send-message'): void;
}>();

function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    return marked.parse(content, { gfm: true, breaks: true }) as string;
  } catch {
    return content;
  }
}
</script>

<template>
  <div class="ai-chat-panel">
    <!-- Chat conversation history -->
    <div class="chat-messages-scroll">
      <div class="assistant-welcome">
        <div class="bot-avatar"><Sparkles :size="16" /></div>
        <div class="bot-msg-body">
          您好！我是 <strong>AI 问卷编辑助手</strong>。我可以协助您精准增加、删除、修改特定题号或选项，请随时输入您的调整意图。
        </div>
      </div>

      <!-- Dialogue bubbles -->
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

    <!-- Collapsible diff changes list -->
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
              <NTag
                size="small"
                :bordered="false"
                :type="item.type === 'added' ? 'success' : item.type === 'modified' ? 'warning' : 'error'"
              >
                {{ item.type === 'added' ? '新增' : item.type === 'modified' ? '修改' : '删除' }}
              </NTag>
              <span class="diff-item-title">{{ item.title }}</span>
              <span class="diff-item-detail">{{ item.detail }}</span>
            </div>
          </div>
        </NCollapseItem>
      </NCollapse>
    </div>

    <!-- Bottom input row -->
    <div class="chat-input-row">
      <NInput
        :value="userPromptInput"
        type="textarea"
        :rows="2"
        placeholder="输入修改指令，如：把第 4 题选项改成 5 个，并在最后加一道建议题..."
        :disabled="chatLoading"
        @update:value="(val) => emit('update:userPromptInput', val)"
        @keydown.enter.prevent="emit('send-message')"
      />
      <NButton
        type="primary"
        class="send-btn"
        :loading="chatLoading"
        :disabled="!userPromptInput.trim()"
        @click="emit('send-message')"
      >
        <template #icon><Send :size="16" /></template>
        发送
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.ai-chat-panel {
  width: 440px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-messages-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assistant-welcome {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
}

.bot-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bot-msg-body {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.chat-bubble-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.chat-bubble-row.user {
  flex-direction: row-reverse;
}

.bubble-avatar {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-bubble-row.assistant .bubble-avatar {
  background: #eef2ff;
  color: #4f46e5;
}

.chat-bubble-row.user .bubble-avatar {
  background: #f1f5f9;
  color: #475569;
}

.bubble-content {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
}

.chat-bubble-row.assistant .bubble-content {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #1e293b;
}

.chat-bubble-row.user .bubble-content {
  background: #4f46e5;
  color: #ffffff;
}

.chat-loading-row {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.diff-changes-drawer {
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 8px 12px;
  max-height: 140px;
  overflow-y: auto;
}

.diff-items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}

.diff-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.diff-item-title {
  font-weight: 600;
  color: #1e293b;
}

.diff-item-detail {
  color: #64748b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
}

.send-btn {
  align-self: flex-end;
}
</style>
