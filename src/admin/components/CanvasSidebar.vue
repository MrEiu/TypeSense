<script setup lang="ts">
import {
  NTag,
  NInput,
  NDropdown,
  NButton,
  NTooltip,
  NPopconfirm,
  type DropdownOption,
} from 'naive-ui';
import {
  Search,
  Plus,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
} from 'lucide-vue-next';
import type {
  QuestionnaireModel,
  QuestionItemModel,
  QuestionKind,
} from '../../schema/questionnaire-schema-types';

const props = defineProps<{
  questionnaire: QuestionnaireModel;
  activeQuestionIndex: number;
  filteredQuestions: Array<{ q: QuestionItemModel; idx: number }>;
  outlineSearchQuery: string;
}>();

const emit = defineEmits<{
  (e: 'update:outlineSearchQuery', val: string): void;
  (e: 'select-question', index: number): void;
  (e: 'add-question', type: QuestionKind): void;
  (e: 'move-question', index: number, direction: 'up' | 'down'): void;
  (e: 'duplicate-question', index: number): void;
  (e: 'delete-question', index: number): void;
}>();

const addQuestionDropdownOptions: DropdownOption[] = [
  { label: '单选题 (Single Choice)', key: 'single_choice' },
  { label: '多选题 (Multiple Choice)', key: 'multiple_choice' },
  { label: '李克特量表 (Likert Scale)', key: 'likert_scale' },
  { label: '开放问答 (Text Input)', key: 'text_input' },
];

function handleAddDropdown(key: string | number) {
  emit('add-question', String(key) as QuestionKind);
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

function getQuestionTypeTagType(
  type: QuestionKind
): 'primary' | 'info' | 'success' | 'warning' | 'default' {
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
</script>

<template>
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
          :value="outlineSearchQuery"
          size="small"
          placeholder="搜索题目序号/标题..."
          clearable
          @update:value="(val) => emit('update:outlineSearchQuery', val)"
        >
          <template #prefix><Search :size="13" style="color: #94a3b8;" /></template>
        </NInput>
        <NDropdown
          trigger="click"
          :options="addQuestionDropdownOptions"
          @select="handleAddDropdown"
        >
          <NButton size="small" type="primary">
            <template #icon><Plus :size="14" /></template>
            <span>加题</span>
          </NButton>
        </NDropdown>
      </div>
    </div>

    <!-- Questions list -->
    <div class="outline-list-scroller">
      <div
        v-for="{ q, idx } in filteredQuestions"
        :key="q.id"
        class="outline-item-card"
        :class="{ 'is-active': idx === activeQuestionIndex }"
        @click="emit('select-question', idx)"
      >
        <div class="item-main-row">
          <span class="item-index-label">Q{{ idx + 1 }}</span>
          <NTag size="tiny" :type="getQuestionTypeTagType(q.type)" :bordered="false">
            {{ getQuestionTypeName(q.type) }}
          </NTag>
          <span class="item-title-text" :title="q.title">{{ q.title }}</span>
          <span v-if="q.jump" class="item-jump-badge" title="配置了分支跳转规则">⚡</span>
        </div>

        <!-- Action buttons -->
        <div class="item-actions-row" @click.stop>
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton
                quaternary
                size="tiny"
                :disabled="idx === 0"
                @click="emit('move-question', idx, 'up')"
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
                @click="emit('move-question', idx, 'down')"
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
                @click="emit('duplicate-question', idx)"
              >
                <template #icon><Copy :size="13" /></template>
              </NButton>
            </template>
            复制
          </NTooltip>

          <NPopconfirm
            positive-text="确认删除"
            negative-text="取消"
            @positive-click="emit('delete-question', idx)"
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
</template>

<style scoped>
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
  padding: 10px 12px;
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
  transition: all 0.15s ease-in-out;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.outline-item-card:hover {
  background: #f1f5f9;
  border-color: rgba(15, 23, 42, 0.06);
}

.outline-item-card.is-active {
  background: #eef2ff;
  border-color: #c7d2fe;
  box-shadow: 0 1px 3px rgba(79, 70, 229, 0.08);
}

.item-main-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-index-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  min-width: 24px;
}

.outline-item-card.is-active .item-index-label {
  color: #4f46e5;
}

.item-title-text {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-jump-badge {
  font-size: 11px;
}

.item-actions-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0.7;
}

.outline-item-card:hover .item-actions-row,
.outline-item-card.is-active .item-actions-row {
  opacity: 1;
}
</style>
