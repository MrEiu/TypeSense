<script setup lang="ts">
/**
 * src/console/components/studio/StudioDocumentStep.vue
 *
 * Wizard Step 1: Knowledge Base Document Selection and File Upload.
 */

import { ref } from 'vue';
import { NButton } from 'naive-ui';
import {
  BookOpen,
  UploadCloud,
  Search,
  X,
  FileText,
  Trash2,
  RefreshCw,
  ArrowRight,
} from 'lucide-vue-next';
import type { DocumentItem } from '../../../services/ai-generator-client-service';

const props = defineProps<{
  documents: DocumentItem[];
  filteredDocuments: DocumentItem[];
  selectedDocId: string | null;
  activeDoc: DocumentItem | null;
  docSearchQuery: string;
  docTabMode: 'history' | 'upload';
  isUploading: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:docSearchQuery', val: string): void;
  (e: 'update:docTabMode', val: 'history' | 'upload'): void;
  (e: 'select-doc', id: string): void;
  (e: 'clear-doc'): void;
  (e: 'delete-doc', id: string): void;
  (e: 'file-upload', e: Event): void;
  (e: 'next'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerFileSelect() {
  fileInputRef.value?.click();
}

function isWordDoc(filename: string): boolean {
  const lower = (filename || '').toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.doc');
}
</script>

<template>
  <div class="step-content">
    <div class="doc-subtab-switch">
      <button
        type="button"
        class="doc-subtab-btn"
        :class="{ 'is-active': docTabMode === 'history' }"
        @click="emit('update:docTabMode', 'history')"
      >
        <BookOpen :size="13" />
        <span>从历史文档库挑选 ({{ documents.length }})</span>
      </button>
      <button
        type="button"
        class="doc-subtab-btn"
        :class="{ 'is-active': docTabMode === 'upload' }"
        @click="emit('update:docTabMode', 'upload')"
      >
        <UploadCloud :size="13" />
        <span>上传新 Word 文档</span>
      </button>
    </div>

    <!-- History Documents List -->
    <div v-if="docTabMode === 'history'" class="doc-tab-content">
      <div class="doc-search-bar">
        <Search :size="14" class="search-icon" />
        <input
          :value="docSearchQuery"
          type="text"
          placeholder="搜索历史文档名称或摘要..."
          class="doc-search-input"
          @input="(e) => emit('update:docSearchQuery', (e.target as HTMLInputElement).value)"
        />
        <button
          v-if="docSearchQuery"
          type="button"
          class="clear-search-btn"
          @click="emit('update:docSearchQuery', '')"
        >
          <X :size="12" />
        </button>
      </div>

      <div class="doc-cards-list">
        <div
          v-for="d in filteredDocuments"
          :key="d.id"
          class="doc-item-card"
          :class="{ 'is-selected': selectedDocId === d.id }"
          @click="emit('select-doc', d.id)"
        >
          <div class="doc-card-top">
            <div class="doc-badge" :class="{ 'is-word': isWordDoc(d.originalName) }">
              <FileText :size="13" />
              <span>{{ isWordDoc(d.originalName) ? 'WORD' : 'DOC' }}</span>
            </div>
            <div class="doc-name-text" :title="d.originalName">{{ d.originalName }}</div>
            <button
              type="button"
              class="doc-del-btn"
              title="删除文档"
              @click.stop="emit('delete-doc', d.id)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
          <div v-if="d.summary" class="doc-summary-text">{{ d.summary }}</div>
          <div class="doc-card-meta">
            <span>{{ Math.round(d.fileSize / 1024) }} KB</span>
            <span>·</span>
            <span>{{ new Date(d.createdAt).toLocaleDateString() }}</span>
          </div>
        </div>

        <div v-if="filteredDocuments.length === 0" class="doc-empty-state">
          <span>{{ docSearchQuery ? '未找到匹配文档' : '知识库暂无文档，请上传' }}</span>
        </div>
      </div>
    </div>

    <!-- Upload New Document Area -->
    <div v-else class="doc-tab-content">
      <input
        ref="fileInputRef"
        type="file"
        accept=".docx,.doc,.pdf,.txt,.md"
        style="display: none;"
        @change="(e) => emit('file-upload', e)"
      />
      <div
        class="doc-upload-dropzone"
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

    <!-- Footer selection hint and next button -->
    <div class="card-footer-nav">
      <div class="selection-status-hint">
        <span v-if="selectedDocId">已选用文档: <strong>{{ activeDoc?.originalName }}</strong></span>
        <button
          v-if="selectedDocId"
          type="button"
          class="clear-selection-link"
          @click="emit('clear-doc')"
        >
          清除
        </button>
      </div>
      <NButton type="primary" size="medium" @click="emit('next')">
        <span>下一步：设定题目与提示词</span>
        <template #icon><ArrowRight :size="14" /></template>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.step-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.doc-subtab-switch {
  display: flex;
  gap: 8px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
}

.doc-subtab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.doc-subtab-btn.is-active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.doc-tab-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.doc-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
}

.search-icon {
  color: #94a3b8;
}

.doc-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #1e293b;
  outline: none;
}

.clear-search-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
}

.doc-cards-list {
  max-height: 230px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.doc-item-card {
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-item-card:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.doc-item-card.is-selected {
  border-color: #6366f1;
  background: #eef2ff;
}

.doc-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
}

.doc-badge.is-word {
  background: #dbeafe;
  color: #1d4ed8;
}

.doc-name-text {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-del-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s;
}

.doc-del-btn:hover {
  color: #ef4444;
}

.doc-summary-text {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.doc-empty-state {
  padding: 28px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}

.doc-upload-dropzone {
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 36px 20px;
  text-align: center;
  cursor: pointer;
  background: #fafafa;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.doc-upload-dropzone:hover {
  border-color: #4f46e5;
  background: #f5f3ff;
}

.dropzone-icon {
  color: #4f46e5;
}

.anim-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.dropzone-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.dropzone-sub {
  font-size: 11px;
  color: #64748b;
  max-width: 420px;
}

.card-footer-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid rgba(15, 23, 42, 0.05);
}

.selection-status-hint {
  font-size: 12px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-selection-link {
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  text-decoration: underline;
}
</style>
