<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  NCard,
  NTag,
  NInput,
  NSpace,
  NTooltip,
  NSpin,
  NEmpty,
  type GlobalThemeOverrides,
  type MenuOption,
} from 'naive-ui';
import {
  FileQuestion,
  Sparkles,
  Search,
  BarChart3,
  RefreshCw,
} from 'lucide-vue-next';

import {
  QuestionnaireRepositoryService,
  type SurveyMetadataItem,
} from '../services/questionnaire-repository-service';

// 子功能组件
import SurveyFilterToolbar from './components/SurveyFilterToolbar.vue';
import SurveyCardGrid from './components/SurveyCardGrid.vue';
import SurveyTableList from './components/SurveyTableList.vue';
import SurveyPublishModal from './components/SurveyPublishModal.vue';
import SurveyResponsesDrawer from './components/SurveyResponsesDrawer.vue';
import SurveyDetailDrawer from './components/SurveyDetailDrawer.vue';
import AiSurveyStudioModal from './components/AiSurveyStudioModal.vue';

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
];

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

// 复制短码
async function handleCopySlug(survey: SurveyMetadataItem) {
  await navigator.clipboard.writeText(survey.slug || survey.id);
}

// 复制访问链接
async function handleCopyLink(survey: SurveyMetadataItem) {
  const link = QuestionnaireRepositoryService.generateAccessUrl(survey.slug || survey.id);
  await navigator.clipboard.writeText(link);
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
              <NCard
                :bordered="true"
                style="border-radius: 14px; background: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);"
              >
                <!-- 1. 筛选与排序工具栏组件 -->
                <SurveyFilterToolbar
                  v-model:filterTab="currentFilterTab"
                  v-model:sortBy="sortBy"
                  v-model:viewMode="viewMode"
                />

                <!-- 加载中 -->
                <div v-if="loading" style="padding: 80px 0; text-align: center;">
                  <NSpin size="large" />
                </div>

                <!-- 问卷展示区 -->
                <div v-else-if="filteredSurveys.length > 0">
                  <!-- 2. 双栏卡片网格组件 -->
                  <SurveyCardGrid
                    v-if="viewMode === 'grid'"
                    :surveys="filteredSurveys"
                    @open-responses="openResponsesDrawer"
                    @open-detail="openDetailDrawer"
                    @toggle-status="toggleSurveyStatus"
                    @delete="handleDeleteSurvey"
                    @copy-slug="handleCopySlug"
                    @copy-link="handleCopyLink"
                  />

                  <!-- 3. 数据表格列表组件 -->
                  <SurveyTableList
                    v-else
                    :surveys="filteredSurveys"
                    @open-responses="openResponsesDrawer"
                    @open-detail="openDetailDrawer"
                    @toggle-status="toggleSurveyStatus"
                    @delete="handleDeleteSurvey"
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

        <!-- 弹窗 3：发布问卷 Modal (组件化) -->
        <SurveyPublishModal
          v-model:show="isPublishModalOpen"
          @created="loadSurveys"
        />

        <!-- 弹窗 4：AI 问卷智造工坊 Modal -->
        <AiSurveyStudioModal v-model:show="isAiStudioOpen" @created="loadSurveys" />
      </NLayout>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
/* 保持纯净，全部依托 Naive UI 官方组件原生样式与 Design Tokens */
</style>
