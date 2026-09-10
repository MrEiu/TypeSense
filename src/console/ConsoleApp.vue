<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  useMessage,
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  NCard,
  NTag,
  NGrid,
  NGridItem,
  NModal,
  NInput,
  NSpace,
  NPopconfirm,
  NTooltip,
  NSpin,
  NStatistic,
  NTabs,
  NTabPane,
  NSelect,
  NEmpty,
  NDataTable,
  NDropdown,
  NSwitch,
  type GlobalThemeOverrides,
  type MenuOption,
  type DataTableColumns,
} from 'naive-ui';
import {
  Plus,
  ExternalLink,
  Share2,
  Trash2,
  Database,
  Copy,
  Check,
  FileQuestion,
  Sparkles,
  Search,
  LayoutGrid,
  List as ListIcon,
  BarChart3,
  RefreshCw,
  MoreHorizontal,
  ShieldCheck,
  Zap,
  QrCode,
  PauseCircle,
  PlayCircle,
} from 'lucide-vue-next';

import {
  QuestionnaireRepositoryService,
  type SurveyMetadataItem,
} from '../services/questionnaire-repository-service';
import type { QuestionnaireModel } from '../schema/questionnaire-schema-types';
import AiSurveyStudioModal from './components/AiSurveyStudioModal.vue';
import SurveyResponsesDrawer from './components/SurveyResponsesDrawer.vue';
import SurveyDetailDrawer from './components/SurveyDetailDrawer.vue';

// 严格遵循原有 Zen Paper 浅色主题配置
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#4f46e5',
    primaryColorHover: '#4338ca',
    primaryColorPressed: '#3730a3',
    primaryColorSuppl: '#4f46e5',
    borderRadius: '10px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  Card: {
    borderRadius: '12px',
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  Button: {
    fontWeight: '600',
    borderRadiusMedium: '8px',
  },
  Layout: {
    siderColor: '#ffffff',
    headerColor: '#ffffff',
  },
};

// 状态定义
const surveys = ref<SurveyMetadataItem[]>([]);
const loading = ref(true);
const isPublishModalOpen = ref(false);
const isPublishing = ref(false);
const publishJsonText = ref('');
const selectedTemplateKey = ref<string>('fe_engineer');
const isAiStudioOpen = ref(false);

// 侧边栏与主视图状态
const activeMenuKey = ref<string>('all_surveys');
const isSiderCollapsed = ref<boolean>(false);
const searchQuery = ref<string>('');
const currentFilterTab = ref<string>('all');
const sortBy = ref<'newest' | 'responses' | 'questions'>('newest');
const viewMode = ref<'grid' | 'table'>('grid');

// 侧弹窗状态
const isResponsesDrawerOpen = ref(false);
const isDetailDrawerOpen = ref(false);
const selectedSurvey = ref<SurveyMetadataItem | null>(null);

// 菜单配置
function renderIcon(iconComponent: any) {
  return () => h(iconComponent, { style: { width: '18px', height: '18px' } });
}

const menuOptions: MenuOption[] = [
  {
    label: '问卷资产管理',
    key: 'all_surveys',
    icon: renderIcon(FileQuestion),
  },
  {
    label: '全量作答数据',
    key: 'analytics',
    icon: renderIcon(BarChart3),
  },
  {
    label: 'AI 智造工坊',
    key: 'ai_studio',
    icon: renderIcon(Sparkles),
  },
  {
    label: 'SQLite 持久化引擎',
    key: 'storage',
    icon: renderIcon(Database),
  },
];

// 计算属性：KPI 指标
const totalResponses = computed(() => {
  return surveys.value.reduce((sum, s) => sum + (s.responseCount || 0), 0);
});

const activeSurveysCount = computed(() => {
  return surveys.value.filter((s) => s.status !== 'paused').length;
});

const avgQuestionsCount = computed(() => {
  if (surveys.value.length === 0) return 0;
  const total = surveys.value.reduce((sum, s) => sum + (s.questionsCount || 0), 0);
  return Math.round((total / surveys.value.length) * 10) / 10;
});

// 计算属性：过滤与排序后的问卷列表
const filteredSurveys = computed(() => {
  let list = [...surveys.value];

  // 1. 关键词搜索
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.slug && s.slug.toLowerCase().includes(q))
    );
  }

  // 2. Tab 筛选
  if (currentFilterTab.value === 'collecting') {
    list = list.filter((s) => s.status !== 'paused');
  } else if (currentFilterTab.value === 'paused') {
    list = list.filter((s) => s.status === 'paused');
  } else if (currentFilterTab.value === 'has_responses') {
    list = list.filter((s) => (s.responseCount || 0) > 0);
  } else if (currentFilterTab.value === 'logic') {
    list = list.filter((s) => s.questionsCount >= 3);
  }

  // 3. 排序
  if (sortBy.value === 'responses') {
    list.sort((a, b) => (b.responseCount || 0) - (a.responseCount || 0));
  } else if (sortBy.value === 'questions') {
    list.sort((a, b) => (b.questionsCount || 0) - (a.questionsCount || 0));
  } else {
    // 默认最新创建
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return list;
});

// 加载问卷列表
async function loadSurveys() {
  loading.value = true;
  try {
    surveys.value = await QuestionnaireRepositoryService.listSurveys();
  } catch (err) {
    console.error('[ConsoleApp] 加载问卷失败:', err);
  } finally {
    loading.value = false;
  }
}

// 快速切换收集状态
async function toggleSurveyStatus(survey: SurveyMetadataItem, active: boolean) {
  const newStatus: 'published' | 'paused' = active ? 'published' : 'paused';
  const prevStatus = survey.status;
  survey.status = newStatus; // 乐观更新
  try {
    const targetId = survey.slug || survey.id;
    const success = await QuestionnaireRepositoryService.updateSurveyStatus(targetId, newStatus);
    if (!success) {
      survey.status = prevStatus;
      alert('更新问卷收集状态失败');
    }
  } catch (err) {
    survey.status = prevStatus;
    console.error('[ConsoleApp] 切换状态失败:', err);
  }
}

// 侧边栏菜单切换处理
function handleMenuSelect(key: string) {
  activeMenuKey.value = key;
  if (key === 'ai_studio') {
    isAiStudioOpen.value = true;
  } else if (key === 'analytics') {
    if (surveys.value.length > 0) {
      openResponsesDrawer(surveys.value[0]);
    }
  }
}

// 打开作答数据分析抽屉
function openResponsesDrawer(survey: SurveyMetadataItem) {
  selectedSurvey.value = survey;
  isResponsesDrawerOpen.value = true;
}

// 打开问卷详情与分发抽屉 (含二维码)
function openDetailDrawer(survey: SurveyMetadataItem) {
  selectedSurvey.value = survey;
  isDetailDrawerOpen.value = true;
}

// 删除问卷
async function handleDeleteSurvey(survey: SurveyMetadataItem) {
  try {
    const success = await QuestionnaireRepositoryService.deleteSurvey(survey.slug || survey.id);
    if (success) {
      await loadSurveys();
    }
  } catch (err) {
    console.error('删除问卷失败:', err);
  }
}

// 预设模版定义
const PRESET_TEMPLATES: Record<string, { label: string; schema: any }> = {
  fe_engineer: {
    label: '2026 前沿工程师体验调研 (含条件流转)',
    schema: {
      id: `survey_fe_${Date.now()}`,
      title: '2026 全球前沿工程师体验调研',
      description: '探讨现代化工具链、全栈工程化体验与团队工程文化。',
      status: 'published',
      questions: [
        {
          id: 'q1_role',
          title: '您当前在团队中主要负责的核心角色是？',
          type: 'single_choice',
          required: true,
          options: [
            { id: 'fe', label: '前端 / 体验架构师' },
            { id: 'be', label: '后端 / 平台系统研发' },
            { id: 'fullstack', label: '全栈独立开发者' },
            { id: 'lead', label: '技术负责人 / 团队管理者' },
          ],
        },
        {
          id: 'q2_fe_stack',
          title: '前端选型中，您最看重的维度是？',
          type: 'single_choice',
          required: true,
          visible: {
            target: 'q1_role',
            operator: 'in',
            value: [0, 2],
          },
          options: [
            { id: 'dx', label: '极速 DX 与无感 HMR' },
            { id: 'perf', label: '零运行时与高执行性能' },
            { id: 'ecosystem', label: '成熟完整的生态组件库' },
          ],
        },
        {
          id: 'q3_feedback',
          title: '您对目前工具链最大的痛点或期待是什么？',
          type: 'text_input',
          required: false,
          placeholder: '例如：构建配置繁琐、类型推断慢...',
        },
      ],
    },
  },
  nps_satisfaction: {
    label: 'NPS 客户净推荐值与满意度追踪',
    schema: {
      id: `survey_nps_${Date.now()}`,
      title: '产品 NPS 推荐意愿与服务满意度评估',
      description: '帮助我们持续优化产品体验与客户服务质量。',
      status: 'published',
      questions: [
        {
          id: 'q1_nps',
          title: '0 到 10 分，您有多大意愿向同行或朋友推荐我们的系统？',
          type: 'single_choice',
          required: true,
          options: [
            { id: '0_6', label: '0-6 分 (不推荐 / 批评者)' },
            { id: '7_8', label: '7-8 分 (中立态度)' },
            { id: '9_10', label: '9-10 分 (极力推荐 / 忠实粉丝)' },
          ],
        },
        {
          id: 'q2_promoter_reason',
          title: '感谢您的认可！请问最打动您的核心亮点是什么？',
          type: 'text_input',
          required: false,
          visible: {
            target: 'q1_nps',
            operator: 'eq',
            value: 2,
          },
          placeholder: '例如：流畅的响应速度、清爽的界面设计...',
        },
        {
          id: 'q3_detractor_reason',
          title: '非常抱歉未达您的预期，您觉得我们最亟待改进的地方是？',
          type: 'text_input',
          required: true,
          visible: {
            target: 'q1_nps',
            operator: 'eq',
            value: 0,
          },
          placeholder: '请告诉我们您的痛点...',
        },
      ],
    },
  },
  ai_product_eval: {
    label: 'AI 协同研发工具满意度问卷',
    schema: {
      id: `survey_ai_eval_${Date.now()}`,
      title: 'AI 协同研发与代码助手使用效能调研',
      description: '收集团队在日常开发中使用 AI 生成与辅助工具的真实体验。',
      status: 'published',
      questions: [
        {
          id: 'q1_ai_freq',
          title: '您在日常编码工作中调用 AI 助手的频次是？',
          type: 'single_choice',
          required: true,
          options: [
            { id: 'daily', label: '每日深度使用 (超过 10 次)' },
            { id: 'weekly', label: '每周几次辅助解决疑难' },
            { id: 'rare', label: '偶尔尝试' },
            { id: 'never', label: '从不使用' },
          ],
        },
        {
          id: 'q2_ai_scenarios',
          title: '您认为 AI 带来最大提效的场景是？',
          type: 'single_choice',
          required: true,
          options: [
            { id: 'code_gen', label: '样板代码与常规函数自动生成' },
            { id: 'unit_test', label: '单元测试编写' },
            { id: 'bug_fix', label: '报错诊断与排障' },
            { id: 'docs', label: '代码注释与文档生成' },
          ],
        },
      ],
    },
  },
};

// 切换模版
function applyTemplate(key: string) {
  selectedTemplateKey.value = key;
  const tpl = PRESET_TEMPLATES[key];
  if (tpl) {
    const schema = JSON.parse(JSON.stringify(tpl.schema));
    schema.id = `survey_${key}_${Date.now()}`;
    publishJsonText.value = JSON.stringify(schema, null, 2);
  }
}

// 打开快速发布模态框
function openPublishModal() {
  applyTemplate('fe_engineer');
  isPublishModalOpen.value = true;
}

// 提交发布
async function handlePublishSubmit() {
  try {
    isPublishing.value = true;
    const parsed = JSON.parse(publishJsonText.value) as QuestionnaireModel;
    await QuestionnaireRepositoryService.publishSurvey(parsed);
    isPublishModalOpen.value = false;
    await loadSurveys();
  } catch (err) {
    alert(`发布失败: ${(err as Error).message}`);
  } finally {
    isPublishing.value = false;
  }
}

// 表格视图列定义
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
          onUpdateValue: (val: boolean) => toggleSurveyStatus(row, val),
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
    width: 240,
    render(row) {
      return h(NSpace, { size: 6 }, () => [
        h(
          NButton,
          {
            size: 'tiny',
            type: 'primary',
            tag: 'a',
            href: `/survey.html?id=${encodeURIComponent(row.slug || row.id)}`,
            target: '_blank',
          },
          { default: () => '作答' }
        ),
        h(
          NButton,
          {
            size: 'tiny',
            secondary: true,
            type: 'info',
            onClick: () => openResponsesDrawer(row),
          },
          { default: () => '数据' }
        ),
        h(
          NButton,
          {
            size: 'tiny',
            secondary: true,
            onClick: () => openDetailDrawer(row),
          },
          { default: () => '分发链接' }
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDeleteSurvey(row),
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

// 下拉操作选项
function getCardDropdownOptions(survey: SurveyMetadataItem) {
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

async function handleCardDropdownSelect(key: string, survey: SurveyMetadataItem) {
  if (key === 'copy_slug') {
    await navigator.clipboard.writeText(survey.slug || survey.id);
  } else if (key === 'copy_link') {
    const link = QuestionnaireRepositoryService.generateAccessUrl(survey.slug || survey.id);
    await navigator.clipboard.writeText(link);
  } else if (key === 'delete') {
    if (confirm(`确定要删除问卷【${survey.title}】吗？`)) {
      await handleDeleteSurvey(survey);
    }
  }
}

onMounted(() => {
  loadSurveys();
});
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <NLayout has-sider style="min-height: 100vh; background-color: var(--zen-bg, #f8fafc);">
        <!-- 左侧可折叠侧边栏 -->
        <NLayoutSider
          bordered
          collapse-mode="width"
          :collapsed-width="68"
          :width="230"
          :collapsed="isSiderCollapsed"
          show-trigger="arrow-circle"
          @update:collapsed="(val) => (isSiderCollapsed = val)"
          style="background: #ffffff; z-index: 20;"
        >
          <div style="display: flex; flex-direction: column; height: 100%;">
            <!-- 侧边栏 Logo 区 -->
            <div
              style="
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 18px 16px;
                border-bottom: 1px solid rgba(15, 23, 42, 0.06);
              "
            >
              <div
                style="
                  width: 36px;
                  height: 36px;
                  background: #4f46e5;
                  color: #ffffff;
                  border-radius: 10px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 1.15rem;
                  font-weight: 800;
                  flex-shrink: 0;
                  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
                "
              >
                ⚡
              </div>
              <div v-if="!isSiderCollapsed" style="overflow: hidden; white-space: nowrap;">
                <div style="font-weight: 800; font-size: 1.05rem; color: #0f172a; line-height: 1.2;">
                  TypeSense
                </div>
                <div style="font-size: 0.75rem; color: #64748b; font-weight: 500;">
                  流转问卷控制台
                </div>
              </div>
            </div>

            <!-- 侧边栏导航菜单 -->
            <div style="flex: 1; padding: 12px 0;">
              <NMenu
                :value="activeMenuKey"
                :collapsed="isSiderCollapsed"
                :collapsed-width="68"
                :collapsed-icon-size="20"
                :options="menuOptions"
                @update:value="handleMenuSelect"
              />
            </div>

            <!-- 侧边栏底部存储状态卡片 -->
            <div v-if="!isSiderCollapsed" style="padding: 16px; border-top: 1px solid rgba(15, 23, 42, 0.06);">
              <div
                style="
                  background: #f1f5f9;
                  border-radius: 8px;
                  padding: 10px 12px;
                  display: flex;
                  align-items: center;
                  gap: 10px;
                "
              >
                <Database style="width: 18px; height: 18px; color: #4f46e5; flex-shrink: 0;" />
                <div style="font-size: 0.78rem; line-height: 1.3;">
                  <div style="font-weight: 700; color: #1e293b;">SQLite 3 (WAL)</div>
                  <div style="color: #10b981; font-weight: 600;">● 持久化已连接</div>
                </div>
              </div>
            </div>
          </div>
        </NLayoutSider>

        <!-- 右侧主体框架 -->
        <NLayout style="background-color: var(--zen-bg, #f8fafc);">
          <!-- 顶栏 Header -->
          <NLayoutHeader
            bordered
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 0 28px;
              height: 64px;
              background: #ffffff;
            "
          >
            <div style="display: flex; align-items: center; gap: 16px;">
              <h2 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">
                问卷管理与分发管控
              </h2>
              <NTag size="small" type="primary" :bordered="false" round>
                {{ filteredSurveys.length }} 份问卷
              </NTag>
            </div>

            <!-- 顶栏搜索与操作区 -->
            <div style="display: flex; align-items: center; gap: 12px;">
              <NInput
                v-model:value="searchQuery"
                placeholder="搜索问卷标题或短码..."
                clearable
                size="small"
                style="width: 260px;"
              >
                <template #prefix>
                  <Search style="width: 14px; height: 14px; color: #94a3b8;" />
                </template>
              </NInput>

              <NTooltip trigger="hover">
                <template #trigger>
                  <NButton size="small" quaternary @click="loadSurveys" :loading="loading">
                    <template #icon>
                      <RefreshCw style="width: 15px; height: 15px;" />
                    </template>
                  </NButton>
                </template>
                重新从 SQLite 数据库同步
              </NTooltip>
            </div>
          </NLayoutHeader>

          <!-- 主内容区域 Content -->
          <NLayoutContent style="padding: 24px 28px 80px 28px;">
            <div style="max-width: 1280px; margin: 0 auto;">

              <!-- 外层大卡片包裹整个问卷管理与列表区 -->
              <NCard :bordered="true" style="border-radius: 14px; background: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);">
                <!-- 筛选工具栏 -->
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
                    v-model:value="currentFilterTab"
                    type="segment"
                    size="small"
                    style="max-width: 520px;"
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
                      v-model:value="sortBy"
                      size="small"
                      style="width: 140px;"
                      :options="[
                        { label: '最新创建', value: 'newest' },
                        { label: '答卷数量最多', value: 'responses' },
                        { label: '题目数量最多', value: 'questions' },
                      ]"
                    />

                    <NSpace :size="4">
                      <NButton
                        size="small"
                        :type="viewMode === 'grid' ? 'primary' : 'default'"
                        quaternary
                        @click="viewMode = 'grid'"
                      >
                        <template #icon>
                          <LayoutGrid style="width: 16px; height: 16px;" />
                        </template>
                      </NButton>
                      <NButton
                        size="small"
                        :type="viewMode === 'table' ? 'primary' : 'default'"
                        quaternary
                        @click="viewMode = 'table'"
                      >
                        <template #icon>
                          <ListIcon style="width: 16px; height: 16px;" />
                        </template>
                      </NButton>
                    </NSpace>
                  </div>
                </div>

                <!-- 加载中 -->
                <div v-if="loading" style="padding: 80px 0; text-align: center;">
                  <NSpin size="large" />
                </div>

                <!-- 问卷展示区 -->
                <div v-else-if="filteredSurveys.length > 0">
                  <!-- 视图 1：双栏网格卡片模式 (2列) -->
                  <NGrid
                    v-if="viewMode === 'grid'"
                    :cols="{ default: 1, 768: 2 }"
                    :x-gap="16"
                    :y-gap="16"
                  >
                    <NGridItem v-for="item in filteredSurveys" :key="item.id">
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
                                @update:value="(val) => toggleSurveyStatus(item, val)"
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
                              @click="openResponsesDrawer(item)"
                            >
                              <template #icon>
                                <BarChart3 style="width: 14px; height: 14px;" />
                              </template>
                              数据
                            </NButton>

                            <NButton size="small" secondary @click="openDetailDrawer(item)">
                              <template #icon>
                                <Share2 style="width: 14px; height: 14px;" />
                              </template>
                              分发链接
                            </NButton>
                          </NSpace>

                          <div style="display: flex; align-items: center; gap: 4px;">
                            <NDropdown
                              trigger="click"
                              :options="getCardDropdownOptions(item)"
                              @select="(key) => handleCardDropdownSelect(key, item)"
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

                  <!-- 视图 2：表格模式 -->
                  <NDataTable
                    v-else
                    :columns="tableColumns"
                    :data="filteredSurveys"
                    :pagination="{ pageSize: 10 }"
                    size="small"
                  />
                </div>

                <!-- 空状态 -->
                <div v-else style="padding: 60px 0; text-align: center;">
                  <NEmpty description="未找到符合条件的问卷">
                    <template #extra>
                      <NSpace justify="center">
                        <NButton v-if="searchQuery" secondary size="small" @click="searchQuery = ''">
                          清除搜索关键词
                        </NButton>
                      </NSpace>
                    </template>
                  </NEmpty>
                </div>
              </NCard>
            </div>
          </NLayoutContent>
        </NLayout>

        <!-- 侧弹窗 1：作答数据分析与明细抽屉 -->
        <SurveyResponsesDrawer
          v-model:show="isResponsesDrawerOpen"
          :survey="selectedSurvey"
        />

        <!-- 侧弹窗 2：问卷详情与快速分发抽屉 (含二维码与状态控制) -->
        <SurveyDetailDrawer
          v-model:show="isDetailDrawerOpen"
          :survey="selectedSurvey"
          @status-changed="loadSurveys"
        />

        <!-- 弹窗 3：发布问卷 Modal (带多模板选择) -->
        <NModal
          v-model:show="isPublishModalOpen"
          preset="card"
          title="发布新问卷到 SQLite 数据库"
          style="max-width: 720px; width: 92%; border-radius: 14px;"
        >
          <!-- 模板快速选择器 -->
          <div style="margin-bottom: 14px;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">
              选择行业精品模板载入：
            </label>
            <NSelect
              v-model:value="selectedTemplateKey"
              :options="[
                { label: '2026 前沿工程师体验调研 (含条件流转)', value: 'fe_engineer' },
                { label: 'NPS 客户净推荐值与满意度追踪', value: 'nps_satisfaction' },
                { label: 'AI 协同研发工具满意度问卷', value: 'ai_product_eval' },
              ]"
              @update:value="applyTemplate"
            />
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.85rem; font-weight: 600; color: #334155;">
              问卷 Schema JSON 配置：
            </span>
            <span style="font-size: 0.78rem; color: #94a3b8;">
              系统将自动完成拓扑校验并写入 SQLite
            </span>
          </div>

          <NInput
            v-model:value="publishJsonText"
            type="textarea"
            :rows="13"
            placeholder="粘贴问卷 JSON 结构..."
            style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;"
          />

          <template #footer>
            <div style="display: flex; justify-content: flex-end; gap: 12px;">
              <NButton @click="isPublishModalOpen = false">取消</NButton>
              <NButton type="primary" :loading="isPublishing" @click="handlePublishSubmit">
                即刻发布入库
              </NButton>
            </div>
          </template>
        </NModal>

        <!-- 弹窗 4：AI 问卷智造工坊 Modal -->
        <AiSurveyStudioModal v-model:show="isAiStudioOpen" @created="loadSurveys" />
      </NLayout>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
/* 保持简洁，全部依托 Naive UI 官方组件原生样式与 Design Tokens */
</style>
