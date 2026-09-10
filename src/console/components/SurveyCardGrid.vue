<script setup lang="ts">
import {
  NGrid,
  NGridItem,
  NCard,
  NTag,
  NSwitch,
  NSpace,
  NButton,
  NDropdown,
} from 'naive-ui';
import {
  ExternalLink,
  BarChart3,
  Share2,
  MoreHorizontal,
} from 'lucide-vue-next';
import type { SurveyMetadataItem } from '../../services/questionnaire-repository-service';

defineProps<{
  surveys: SurveyMetadataItem[];
}>();

const emit = defineEmits<{
  (e: 'open-responses', survey: SurveyMetadataItem): void;
  (e: 'open-detail', survey: SurveyMetadataItem): void;
  (e: 'toggle-status', survey: SurveyMetadataItem, active: boolean): void;
  (e: 'delete', survey: SurveyMetadataItem): void;
  (e: 'copy-slug', survey: SurveyMetadataItem): void;
  (e: 'copy-link', survey: SurveyMetadataItem): void;
}>();

function getDropdownOptions() {
  return [
    {
      label: '复制短码 Slug',
      key: 'copy_slug',
    },
    {
      label: '复制直接访问链接',
      key: 'copy_link',
    },
    {
      type: 'divider',
      key: 'd1',
    },
    {
      label: '从 SQLite 数据库删除',
      key: 'delete',
    },
  ];
}

function handleDropdownSelect(key: string, survey: SurveyMetadataItem) {
  if (key === 'copy_slug') {
    emit('copy-slug', survey);
  } else if (key === 'copy_link') {
    emit('copy-link', survey);
  } else if (key === 'delete') {
    emit('delete', survey);
  }
}
</script>

<template>
  <NGrid :cols="{ default: 1, 768: 2 }" :x-gap="16" :y-gap="16">
    <NGridItem v-for="item in surveys" :key="item.id">
      <NCard
        hoverable
        size="small"
        style="
          border-radius: 12px;
          background: #fafafa;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: all 0.2s ease;
        "
      >
        <div>
          <!-- 卡片头部状态与控制开关 -->
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
            "
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <NSwitch
                size="small"
                :value="item.status !== 'paused'"
                @update:value="(val) => emit('toggle-status', item, val)"
              />
              <NTag
                size="tiny"
                :type="item.status !== 'paused' ? 'success' : 'warning'"
                :bordered="false"
                round
              >
                {{ item.status !== 'paused' ? '收集中' : '已暂停' }}
              </NTag>
            </div>
            <span style="font-size: 0.78rem; color: #94a3b8;">
              {{ new Date(item.createdAt).toLocaleDateString() }}
            </span>
          </div>

          <!-- 标题与描述 -->
          <h3
            style="
              margin: 0 0 8px 0;
              font-size: 1.02rem;
              font-weight: 700;
              color: #0f172a;
              line-height: 1.4;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            "
            :title="item.title"
          >
            {{ item.title }}
          </h3>
          <p
            style="
              margin: 0 0 16px 0;
              font-size: 0.85rem;
              color: #64748b;
              line-height: 1.5;
              height: 38px;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            "
          >
            {{ item.description || '暂无说明，包含分支流向与动态条件计算。' }}
          </p>

          <!-- 属性徽标行 -->
          <NSpace :size="6" style="margin-bottom: 16px;">
            <NTag size="small" :bordered="false">
              <strong>{{ item.questionsCount }}</strong> 题
            </NTag>
            <NTag
              size="small"
              :bordered="false"
              :type="(item.responseCount || 0) > 0 ? 'success' : 'default'"
            >
              <strong>{{ item.responseCount || 0 }}</strong> 份作答
            </NTag>
            <NTag size="small" :bordered="false" type="info" style="font-family: monospace;">
              {{ item.slug || item.id }}
            </NTag>
          </NSpace>
        </div>

        <!-- 底部操作按钮行 -->
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 12px;
            border-top: 1px solid rgba(15, 23, 42, 0.06);
          "
        >
          <NSpace :size="6">
            <NButton
              size="small"
              type="primary"
              tag="a"
              :href="`/survey.html?id=${encodeURIComponent(item.slug || item.id)}`"
              target="_blank"
            >
              <template #icon>
                <ExternalLink style="width: 14px; height: 14px;" />
              </template>
              作答
            </NButton>

            <NButton
              size="small"
              secondary
              type="info"
              @click="emit('open-responses', item)"
            >
              <template #icon>
                <BarChart3 style="width: 14px; height: 14px;" />
              </template>
              数据
            </NButton>

            <NButton size="small" secondary @click="emit('open-detail', item)">
              <template #icon>
                <Share2 style="width: 14px; height: 14px;" />
              </template>
              分发链接
            </NButton>
          </NSpace>

          <div style="display: flex; align-items: center; gap: 4px;">
            <NDropdown
              trigger="click"
              :options="getDropdownOptions()"
              @select="(key) => handleDropdownSelect(key, item)"
            >
              <NButton size="small" quaternary>
                <template #icon>
                  <MoreHorizontal style="width: 14px; height: 14px;" />
                </template>
              </NButton>
            </NDropdown>
          </div>
        </div>
      </NCard>
    </NGridItem>
  </NGrid>
</template>
