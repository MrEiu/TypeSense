<script setup lang="ts">
import { h } from 'vue';
import {
  NDataTable,
  NTag,
  NSwitch,
  NSpace,
  NButton,
  NPopconfirm,
  type DataTableColumns,
} from 'naive-ui';
import type { SurveyMetadataItem } from '../../services/questionnaire-repository-service';

const props = defineProps<{
  surveys: SurveyMetadataItem[];
}>();

const emit = defineEmits<{
  (e: 'open-responses', survey: SurveyMetadataItem): void;
  (e: 'open-detail', survey: SurveyMetadataItem): void;
  (e: 'toggle-status', survey: SurveyMetadataItem, active: boolean): void;
  (e: 'delete', survey: SurveyMetadataItem): void;
}>();

const tableColumns: DataTableColumns<SurveyMetadataItem> = [
  {
    title: '问卷标题 / 描述',
    key: 'title',
    render(row) {
      return h('div', { style: 'display: flex; flex-direction: column; gap: 2px;' }, [
        h('span', { style: 'font-weight: 600; color: #0f172a; font-size: 0.95rem;' }, row.title),
        h(
          'span',
          { style: 'color: #64748b; font-size: 0.8rem; line-height: 1.4;' },
          row.description || '暂无说明'
        ),
      ]);
    },
  },
  {
    title: '作答收集状态',
    key: 'status',
    width: 140,
    render(row) {
      const isCollecting = row.status !== 'paused';
      return h(NSpace, { align: 'center', size: 8 }, () => [
        h(NSwitch, {
          size: 'small',
          value: isCollecting,
          onUpdateValue: (val: boolean) => emit('toggle-status', row, val),
        }),
        h(
          NTag,
          {
            size: 'small',
            type: isCollecting ? 'success' : 'warning',
            bordered: false,
            round: true,
          },
          { default: () => (isCollecting ? '收集中' : '已暂停') }
        ),
      ]);
    },
  },
  {
    title: '短码 Slug',
    key: 'slug',
    width: 130,
    render(row) {
      return h(
        NTag,
        { size: 'small', type: 'info', bordered: false, round: true },
        { default: () => row.slug || row.id }
      );
    },
  },
  {
    title: '题目数',
    key: 'questionsCount',
    width: 80,
    render(row) {
      return h('span', { style: 'font-weight: 600;' }, `${row.questionsCount} 题`);
    },
  },
  {
    title: '作答数',
    key: 'responseCount',
    width: 90,
    render(row) {
      return h(
        NTag,
        {
          size: 'small',
          type: (row.responseCount || 0) > 0 ? 'success' : 'default',
          bordered: false,
        },
        { default: () => `${row.responseCount || 0} 份` }
      );
    },
  },
  {
    title: '发布时间',
    key: 'createdAt',
    width: 120,
    render(row) {
      try {
        return new Date(row.createdAt).toLocaleDateString();
      } catch {
        return '-';
      }
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 250,
    render(row) {
      return h(NSpace, { size: 6 }, () => [
        h(
          NButton,
          {
            size: 'tiny',
            secondary: true,
            type: 'primary',
            onClick: () => emit('open-detail', row),
          },
          { default: () => '发布' }
        ),
        h(
          NButton,
          {
            size: 'tiny',
            secondary: true,
            type: 'info',
            onClick: () => emit('open-responses', row),
          },
          { default: () => '数据' }
        ),
        h(
          NButton,
          {
            size: 'tiny',
            secondary: true,
            type: 'success',
            tag: 'a',
            href: `/survey.html?id=${encodeURIComponent(row.slug || row.id)}`,
            target: '_blank',
          },
          { default: () => '体验' }
        ),
        h(
          NButton,
          {
            size: 'tiny',
            secondary: true,
            type: 'warning',
            tag: 'a',
            href: `/admin.html?id=${encodeURIComponent(row.slug || row.id)}`,
            target: '_blank',
          },
          { default: () => '编排' }
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => emit('delete', row),
            positiveText: '确认删除',
            negativeText: '取消',
          },
          {
            trigger: () =>
              h(
                NButton,
                { size: 'tiny', quaternary: true, type: 'error' },
                { default: () => '删除' }
              ),
            default: () => '确定要从 SQLite 数据库永久删除此问卷吗？',
          }
        ),
      ]);
    },
  },
];
</script>

<template>
  <NDataTable
    :columns="tableColumns"
    :data="surveys"
    :pagination="{ pageSize: 10 }"
    size="small"
  />
</template>
