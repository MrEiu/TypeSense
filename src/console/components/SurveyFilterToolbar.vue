<script setup lang="ts">
import {
  NTabs,
  NTabPane,
  NSelect,
  NButton,
  NSpace,
} from 'naive-ui';
import {
  LayoutGrid,
  List as ListIcon,
} from 'lucide-vue-next';

defineProps<{
  filterTab: string;
  sortBy: 'newest' | 'responses' | 'questions';
  viewMode: 'grid' | 'table';
}>();

const emit = defineEmits<{
  (e: 'update:filterTab', val: string): void;
  (e: 'update:sortBy', val: 'newest' | 'responses' | 'questions'): void;
  (e: 'update:viewMode', val: 'grid' | 'table'): void;
}>();
</script>

<template>
  <div
    style="
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.06);
    "
  >
    <!-- 分类 Tabs -->
    <NTabs
      :value="filterTab"
      type="segment"
      size="small"
      style="max-width: 520px;"
      @update:value="(val) => emit('update:filterTab', val)"
    >
      <NTabPane name="all" tab="全部问卷" />
      <NTabPane name="collecting" tab="● 正在收集" />
      <NTabPane name="paused" tab="● 已暂停" />
      <NTabPane name="has_responses" tab="已有作答" />
      <NTabPane name="logic" tab="含分支逻辑" />
    </NTabs>

    <!-- 排序与视图切换 -->
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 0.85rem; color: #64748b; font-weight: 500;">排序:</span>
      <NSelect
        :value="sortBy"
        size="small"
        style="width: 140px;"
        :options="[
          { label: '最新创建', value: 'newest' },
          { label: '答卷数量最多', value: 'responses' },
          { label: '题目数量最多', value: 'questions' },
        ]"
        @update:value="(val) => emit('update:sortBy', val)"
      />

      <NSpace :size="4">
        <NButton
          size="small"
          :type="viewMode === 'grid' ? 'primary' : 'default'"
          quaternary
          @click="emit('update:viewMode', 'grid')"
        >
          <template #icon>
            <LayoutGrid style="width: 16px; height: 16px;" />
          </template>
        </NButton>
        <NButton
          size="small"
          :type="viewMode === 'table' ? 'primary' : 'default'"
          quaternary
          @click="emit('update:viewMode', 'table')"
        >
          <template #icon>
            <ListIcon style="width: 16px; height: 16px;" />
          </template>
        </NButton>
      </NSpace>
    </div>
  </div>
</template>
