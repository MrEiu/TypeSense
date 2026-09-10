<script setup lang="ts">
import { ref, computed, watch, h } from 'vue';
import {
  NDrawer,
  NDrawerContent,
  NStatistic,
  NGrid,
  NGridItem,
  NCard,
  NDataTable,
  NTag,
  NButton,
  NSpace,
  NSpin,
  NEmpty,
  type DataTableColumns,
} from 'naive-ui';
import {
  Download,
  FileSpreadsheet,
  FileJson,
  RefreshCw,
} from 'lucide-vue-next';
import type { SurveyMetadataItem } from '../../services/questionnaire-repository-service';

const props = defineProps<{
  show: boolean;
  survey: SurveyMetadataItem | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
}>();

interface ResponseItem {
  id: string;
  surveyId: string;
  answers: Record<string, any>;
  status: string;
  createdAt: string;
  linkCode?: string;
  username?: string;
  userId?: string;
}

const loading = ref(false);
const responses = ref<ResponseItem[]>([]);
const selectedResponse = ref<ResponseItem | null>(null);

// 监听弹窗打开，自动拉取后端数据
watch(
  () => [props.show, props.survey?.id],
  async ([show, id]) => {
    if (show && id) {
      await fetchResponses();
    } else {
      responses.value = [];
      selectedResponse.value = null;
    }
  }
);

async function fetchResponses() {
  if (!props.survey) return;
  loading.value = true;
  try {
    const targetId = props.survey.slug || props.survey.id;
    const resp = await fetch(`/api/surveys/${encodeURIComponent(targetId)}/responses`);
    if (resp.ok) {
      responses.value = await resp.json();
    } else {
      responses.value = [];
    }
  } catch (err) {
    console.error('[SurveyResponsesDrawer] 获取答卷失败:', err);
    responses.value = [];
  } finally {
    loading.value = false;
  }
}

// 统计计算
const totalCount = computed(() => responses.value.length);
const completedCount = computed(() =>
  responses.value.filter((r) => r.status === 'completed' || !r.status).length
);
const completionRate = computed(() => {
  if (totalCount.value === 0) return 0;
  return Math.round((completedCount.value / totalCount.value) * 100);
});
const lastSubmittedTime = computed(() => {
  if (responses.value.length === 0) return '暂无提交';
  const latest = responses.value[0];
  try {
    return new Date(latest.createdAt).toLocaleString();
  } catch {
    return latest.createdAt || '未知';
  }
});

// 表格列定义
const columns: DataTableColumns<ResponseItem> = [
  {
    title: '答卷 ID / 序号',
    key: 'id',
    width: 130,
    ellipsis: { tooltip: true },
    render(row) {
      return row.id.length > 12 ? `${row.id.substring(0, 10)}...` : row.id;
    },
  },
  {
    title: '受访用户',
    key: 'username',
    width: 120,
    render(row) {
      if (!row.username || row.username === 'anonymous') {
        return h(NTag, { size: 'tiny', bordered: false, round: true }, { default: () => '匿名用户' });
      }
      return h(
        'span',
        { style: { fontWeight: 600, color: '#334155' } },
        row.username
      );
    },
  },
  {
    title: '作答状态',
    key: 'status',
    width: 110,
    render(row) {
      const isCompleted = row.status === 'completed' || !row.status;
      return h(
        NTag,
        { size: 'small', type: isCompleted ? 'success' : 'warning', bordered: false, round: true },
        { default: () => (isCompleted ? '已完成' : '部分作答') }
      );
    },
  },
  {
    title: '提交时间',
    key: 'createdAt',
    width: 160,
    render(row) {
      try {
        return new Date(row.createdAt).toLocaleString();
      } catch {
        return row.createdAt || '-';
      }
    },
  },
  {
    title: '作答题数',
    key: 'answers',
    width: 90,
    render(row) {
      const keys = Object.keys(row.answers || {});
      return `${keys.length} 项`;
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render(row) {
      return h(
        NButton,
        {
          size: 'tiny',
          quaternary: true,
          type: 'primary',
          onClick: () => {
            selectedResponse.value = row;
          },
        },
        { default: () => '查看明细' }
      );
    },
  },
];

// 导出 CSV
function exportCsv() {
  if (responses.value.length === 0 || !props.survey) return;

  const allQuestionKeys = new Set<string>();
  responses.value.forEach((r) => {
    Object.keys(r.answers || {}).forEach((k) => allQuestionKeys.add(k));
  });
  const headers = ['答卷ID', '受访用户', '用户ID', '状态', '提交时间', '短链渠道', ...Array.from(allQuestionKeys)];

  const rows = responses.value.map((r) => {
    const base = [
      r.id,
      r.username || '匿名用户',
      r.userId || '',
      r.status || 'completed',
      r.createdAt || '',
      r.linkCode || '',
    ];
    const ans = Array.from(allQuestionKeys).map((k) => {
      const val = r.answers?.[k];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val).replace(/"/g, '""');
      return String(val).replace(/"/g, '""');
    });
    return [...base, ...ans].map((v) => `"${v}"`).join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${props.survey.title}_答卷数据_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 导出 JSON
function exportJson() {
  if (responses.value.length === 0 || !props.survey) return;
  const jsonStr = JSON.stringify(responses.value, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${props.survey.title}_答卷数据_${Date.now()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
</script>

<template>
  <NDrawer
    :show="show"
    :width="760"
    placement="right"
    @update:show="(val) => emit('update:show', val)"
  >
    <NDrawerContent
      :title="`作答数据分析 · ${survey?.title || '问卷'}`"
      closable
    >
      <template #header>
        <div style="display: flex; align-items: center; gap: 8px;">
          <FileSpreadsheet style="width: 20px; height: 20px; color: var(--zen-primary, #4f46e5);" />
          <span style="font-weight: 700; font-size: 1.05rem;">作答数据分析与明细</span>
        </div>
      </template>

      <!-- 顶部统计概览 -->
      <NGrid :cols="3" :x-gap="12" style="margin-bottom: 20px;">
        <NGridItem>
          <NCard size="small" :bordered="true" style="border-radius: 10px;">
            <NStatistic label="有效作答总数" :value="totalCount">
              <template #suffix>份</template>
            </NStatistic>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard size="small" :bordered="true" style="border-radius: 10px;">
            <NStatistic label="完成率" :value="completionRate">
              <template #suffix>%</template>
            </NStatistic>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard size="small" :bordered="true" style="border-radius: 10px;">
            <NStatistic label="最新作答时间" :value="lastSubmittedTime" />
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- 操作工具栏 -->
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        "
      >
        <div style="display: flex; align-items: center; gap: 8px;">
          <NTag type="info" size="small" round :bordered="false">
            问卷短码: {{ survey?.slug || survey?.id }}
          </NTag>
          <NTag type="default" size="small" round :bordered="false">
            共 {{ survey?.questionsCount || 0 }} 道题
          </NTag>
        </div>

        <NSpace :size="8">
          <NButton size="small" quaternary @click="fetchResponses" :loading="loading">
            <template #icon>
              <RefreshCw style="width: 14px; height: 14px;" />
            </template>
            刷新
          </NButton>
          <NButton
            size="small"
            secondary
            type="primary"
            :disabled="responses.length === 0"
            @click="exportCsv"
          >
            <template #icon>
              <Download style="width: 14px; height: 14px;" />
            </template>
            导出 CSV
          </NButton>
          <NButton
            size="small"
            secondary
            :disabled="responses.length === 0"
            @click="exportJson"
          >
            <template #icon>
              <FileJson style="width: 14px; height: 14px;" />
            </template>
            导出 JSON
          </NButton>
        </NSpace>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" style="padding: 60px 0; text-align: center;">
        <NSpin size="large" />
      </div>

      <!-- 答卷明细表格 -->
      <div v-else-if="responses.length > 0">
        <NDataTable
          :columns="columns"
          :data="responses"
          :pagination="{ pageSize: 8 }"
          size="small"
          :bordered="true"
          style="border-radius: 8px;"
        />

        <!-- 单份答卷查看详情卡片 -->
        <NCard
          v-if="selectedResponse"
          title="选中答卷详情"
          size="small"
          style="margin-top: 20px; border-radius: 10px; background: #fafafa;"
          closable
          @close="selectedResponse = null"
        >
          <div style="margin-bottom: 10px; font-size: 0.85rem; color: #64748b;">
            答卷 ID: <strong>{{ selectedResponse.id }}</strong> · 受访者: <strong style="color: #4f46e5;">{{ selectedResponse.username || '匿名用户' }}</strong> · 提交于 {{ new Date(selectedResponse.createdAt).toLocaleString() }}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div
              v-for="(val, qKey) in selectedResponse.answers"
              :key="qKey"
              style="
                padding: 10px 12px;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
              "
            >
              <div style="font-weight: 600; font-size: 0.88rem; color: #1e293b; margin-bottom: 4px;">
                题目标识: {{ qKey }}
              </div>
              <div style="font-size: 0.85rem; color: #475569; font-family: monospace;">
                {{ typeof val === 'object' ? JSON.stringify(val) : String(val) }}
              </div>
            </div>
          </div>
        </NCard>
      </div>

      <!-- 空状态 -->
      <div v-else style="padding: 60px 0;">
        <NEmpty description="暂未收到受访者答卷">
          <template #extra>
            <NButton
              type="primary"
              size="small"
              tag="a"
              :href="`/survey.html?id=${encodeURIComponent(survey?.slug || survey?.id || '')}`"
              target="_blank"
            >
              去填报第一份测试答卷
            </NButton>
          </template>
        </NEmpty>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
