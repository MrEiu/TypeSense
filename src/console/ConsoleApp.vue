<script setup lang="ts">
import { ref, onMounted, computed, watch, h } from 'vue';
import {
  NConfigProvider,
  NNotificationProvider,
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
  NPagination,
  type GlobalThemeOverrides,
  type MenuOption,
} from 'naive-ui';
import {
  FileQuestion,
  Sparkles,
  Search,
  RefreshCw,
  Plus,
  ShieldCheck,
  LogOut,
  Settings,
  Cpu,
} from 'lucide-vue-next';

import {
  QuestionnaireRepositoryService,
  type SurveyMetadataItem,
} from '../services/questionnaire-repository-service';
import { AuthClientService, type UserProfile } from '../services/auth-client-service';
import { SystemConfigService, type AiSystemConfig } from '../services/system-config-service';
import { TsButton } from '../components/ui';

// 子功能组件
import SurveyFilterToolbar from './components/SurveyFilterToolbar.vue';
import SurveyCardGrid from './components/SurveyCardGrid.vue';
import SurveyTableList from './components/SurveyTableList.vue';
import SurveyPublishModal from './components/SurveyPublishModal.vue';
import SurveyResponsesDrawer from './components/SurveyResponsesDrawer.vue';
import SurveyDetailDrawer from './components/SurveyDetailDrawer.vue';
import AiSurveyStudioModal from './components/AiSurveyStudioModal.vue';
import AiSurveyEditorModal from './components/AiSurveyEditorModal.vue';
import LlmConfigModal from './components/LlmConfigModal.vue';
import AuthModal from '../components/auth/AuthModal.vue';

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
const currentUser = ref<UserProfile | null>(AuthClientService.getUser());
const showAuthModal = ref(!AuthClientService.isAdmin());
const surveys = ref<SurveyMetadataItem[]>([]);
const loading = ref(true);
const isPublishModalOpen = ref(false);
const isAiStudioOpen = ref(false);

// AI 局部编辑状态
const isAiEditorModalOpen = ref(false);
const selectedSurveyForAiEdit = ref<SurveyMetadataItem | null>(null);

function openAiEditor(survey: SurveyMetadataItem) {
  selectedSurveyForAiEdit.value = survey;
  isAiEditorModalOpen.value = true;
}

// 侧边栏与主视图状态
const activeMenuKey = ref<string>('all_surveys');
const isSiderCollapsed = ref<boolean>(false);
const searchQuery = ref<string>('');
const currentFilterTab = ref<string>('all');
const sortBy = ref<'newest' | 'responses' | 'questions'>('newest');
const viewMode = ref<'grid' | 'table'>('grid');

// 侧弹窗与系统配置状态
const isResponsesDrawerOpen = ref(false);
const isDetailDrawerOpen = ref(false);
const selectedSurvey = ref<SurveyMetadataItem | null>(null);

// 大模型系统配置状态
const isLlmConfigModalOpen = ref(false);
const llmConfig = ref<AiSystemConfig | null>(null);
const loadingLlmConfig = ref(false);

async function loadLlmConfig() {
  loadingLlmConfig.value = true;
  try {
    llmConfig.value = await SystemConfigService.getConfig();
  } catch (err) {
    console.error('[ConsoleApp] 获取大模型配置失败:', err);
  } finally {
    loadingLlmConfig.value = false;
  }
}

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
    label: '系统配置',
    key: 'system_settings',
    icon: renderIcon(Settings),
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

// 分页状态管理
const currentPage = ref(1);
const pageSize = ref(12);

const paginatedSurveys = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSurveys.value.slice(start, start + pageSize.value);
});

// 筛选或搜索条件变动时自动重置至第 1 页
watch([searchQuery, currentFilterTab, sortBy, viewMode], () => {
  currentPage.value = 1;
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
  } else if (key === 'system_settings') {
    loadLlmConfig();
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

// 管理员登录成功回调
function onAdminLoginSuccess(user: UserProfile) {
  currentUser.value = user;
  showAuthModal.value = false;
  loadSurveys();
  loadLlmConfig();
}

// 退出管理登录
function handleLogout() {
  AuthClientService.logout();
  currentUser.value = null;
  showAuthModal.value = true;
}

onMounted(() => {
  if (AuthClientService.isAdmin()) {
    loadSurveys();
    loadLlmConfig();
  } else {
    showAuthModal.value = true;
  }

  const handleAuthChange = (e: Event) => {
    const customEvt = e as CustomEvent<UserProfile | null>;
    currentUser.value = customEvt.detail;
    if (!AuthClientService.isAdmin()) {
      showAuthModal.value = true;
    }
  };
  window.addEventListener('typesense:auth-changed', handleAuthChange);
});
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NNotificationProvider placement="bottom-right">
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
                {{ activeMenuKey === 'system_settings' ? '系统配置' : '问卷管理与分发管控' }}
              </h2>
              <NTag v-if="activeMenuKey === 'all_surveys'" size="small" type="primary" :bordered="false" round>
                {{ filteredSurveys.length }} 份问卷
              </NTag>
              <NTag v-else-if="activeMenuKey === 'system_settings'" size="small" type="info" :bordered="false" round>
                大模型与服务参数
              </NTag>
            </div>

            <!-- 顶栏操作区 -->
            <div style="display: flex; align-items: center; gap: 12px;">
              <!-- 问卷管理模式下显示搜索与新建 -->
              <template v-if="activeMenuKey === 'all_surveys'">
                <NInput
                  v-model:value="searchQuery"
                  placeholder="搜索问卷标题或短码..."
                  clearable
                  size="small"
                  style="width: 240px;"
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

                <!-- 新建问卷按钮 (唤起 AI 智造工坊) -->
                <TsButton
                  variant="primary"
                  size="sm"
                  title="创建新问卷 (AI 智造工坊)"
                  @click="isAiStudioOpen = true"
                >
                  <Sparkles style="width: 13px; height: 13px;" />
                  <span>新建问卷</span>
                </TsButton>
              </template>

              <!-- 系统配置模式下显示刷新配置 -->
              <template v-else-if="activeMenuKey === 'system_settings'">
                <NTooltip trigger="hover">
                  <template #trigger>
                    <NButton size="small" quaternary @click="loadLlmConfig" :loading="loadingLlmConfig">
                      <template #icon>
                        <RefreshCw style="width: 15px; height: 15px;" />
                      </template>
                    </NButton>
                  </template>
                  重新获取最新系统配置
                </NTooltip>
              </template>

              <!-- 管理员身份状态与安全登出 -->
              <div
                v-if="currentUser && currentUser.role === 'admin'"
                style="
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-left: 8px;
                  padding-left: 12px;
                  border-left: 1px solid rgba(15, 23, 42, 0.08);
                "
              >
                <div style="display: flex; align-items: center; gap: 6px;">
                  <ShieldCheck style="width: 16px; height: 16px; color: #10b981;" />
                  <span style="font-size: 0.85rem; font-weight: 600; color: #334155;">
                    {{ currentUser.username }}
                  </span>
                  <NTag size="tiny" type="success" :bordered="false" round>管理员</NTag>
                </div>
                <NTooltip trigger="hover">
                  <template #trigger>
                    <NButton size="small" quaternary @click="handleLogout">
                      <template #icon>
                        <LogOut style="width: 14px; height: 14px; color: #64748b;" />
                      </template>
                    </NButton>
                  </template>
                  退出管理登录
                </NTooltip>
              </div>
            </div>
          </NLayoutHeader>

          <!-- 主内容区域 Content -->
          <NLayoutContent style="flex: 1; min-height: 0; padding: 18px 24px 20px 24px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;">
            <!-- 1. 问卷资产管理视图 (自适应填满视口) -->
            <div
              v-if="activeMenuKey === 'all_surveys'"
              class="console-workspace-container"
            >
              <!-- 顶部工具栏卡片 (常驻顶端) -->
              <div class="console-filter-bar-card">
                <SurveyFilterToolbar
                  v-model:filterTab="currentFilterTab"
                  v-model:sortBy="sortBy"
                  v-model:viewMode="viewMode"
                />
              </div>

              <!-- 中间问卷列表区 (自适应撑满，超出自然滚动) -->
              <div class="console-survey-scroll-area">
                <!-- 加载中 -->
                <div v-if="loading" style="padding: 80px 0; text-align: center;">
                  <NSpin size="large" />
                </div>

                <!-- 问卷展示区 -->
                <div v-else-if="filteredSurveys.length > 0">
                  <!-- 双栏卡片网格组件 -->
                  <SurveyCardGrid
                    v-if="viewMode === 'grid'"
                    :surveys="paginatedSurveys"
                    @open-responses="openResponsesDrawer"
                    @open-detail="openDetailDrawer"
                    @open-ai-edit="openAiEditor"
                    @toggle-status="toggleSurveyStatus"
                    @delete="handleDeleteSurvey"
                    @copy-slug="handleCopySlug"
                    @copy-link="handleCopyLink"
                  />

                  <!-- 数据表格列表组件 -->
                  <SurveyTableList
                    v-else
                    :surveys="paginatedSurveys"
                    @open-responses="openResponsesDrawer"
                    @open-detail="openDetailDrawer"
                    @open-ai-edit="openAiEditor"
                    @toggle-status="toggleSurveyStatus"
                    @delete="handleDeleteSurvey"
                  />
                </div>

                <!-- 空状态 -->
                <div v-else class="empty-survey-box">
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
              </div>

              <!-- 底部分页控制器 (常驻自然吸底) -->
              <div v-if="filteredSurveys.length > 0" class="console-pagination-footer-card">
                <div class="footer-total-text">
                  共 <strong style="color: #4f46e5;">{{ filteredSurveys.length }}</strong> 份问卷
                </div>
                <NPagination
                  v-model:page="currentPage"
                  v-model:page-size="pageSize"
                  :item-count="filteredSurveys.length"
                  :page-sizes="[6, 12, 24, 48]"
                  show-size-picker
                  show-quick-jumper
                />
              </div>
            </div>

            <!-- 2. 系统配置视图：大模型服务卡片 -->
            <div v-else-if="activeMenuKey === 'system_settings'" style="max-width: 860px; margin: 0 auto; width: 100%;">
                <div v-if="loadingLlmConfig && !llmConfig" style="padding: 80px 0; text-align: center;">
                  <NSpin size="large" />
                </div>

                <NCard
                  v-else
                  :bordered="true"
                  hoverable
                  style="
                    border-radius: 14px;
                    background: #ffffff;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                    cursor: pointer;
                    transition: all 0.2s ease;
                  "
                  @click="isLlmConfigModalOpen = true"
                >
                  <template #header>
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                      <div style="display: flex; align-items: center; gap: 12px;">
                        <div
                          style="
                            width: 40px;
                            height: 40px;
                            border-radius: 10px;
                            background: rgba(79, 70, 229, 0.1);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #4f46e5;
                          "
                        >
                          <Cpu style="width: 22px; height: 22px;" />
                        </div>
                        <div>
                          <div style="font-size: 1.05rem; font-weight: 700; color: #0f172a;">
                            AI 大模型服务配置
                          </div>
                          <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
                            配置底层大语言模型的接口地址、访问密钥及生效模型
                          </div>
                        </div>
                      </div>
                      <NTag
                        size="small"
                        :type="llmConfig?.hasApiKey ? 'success' : 'warning'"
                        :bordered="false"
                        round
                      >
                        {{ llmConfig?.hasApiKey ? '已接入服务' : '未配置密钥' }}
                      </NTag>
                    </div>
                  </template>

                  <!-- 卡片主体展示当前参数 -->
                  <div
                    style="
                      display: grid;
                      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                      gap: 16px;
                      padding: 8px 0;
                    "
                  >
                    <div
                      style="
                        background: #f8fafc;
                        padding: 14px 16px;
                        border-radius: 10px;
                        border: 1px solid rgba(15, 23, 42, 0.05);
                      "
                    >
                      <div style="font-size: 0.75rem; color: #64748b; font-weight: 600;">
                        API 地址 (BASE URL)
                      </div>
                      <div
                        style="
                          font-size: 0.88rem;
                          font-weight: 600;
                          color: #1e293b;
                          margin-top: 6px;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          white-space: nowrap;
                        "
                        :title="llmConfig?.baseURL"
                      >
                        {{ llmConfig?.baseURL || '官方默认 (https://api.openai.com/v1)' }}
                      </div>
                    </div>

                    <div
                      style="
                        background: #f8fafc;
                        padding: 14px 16px;
                        border-radius: 10px;
                        border: 1px solid rgba(15, 23, 42, 0.05);
                      "
                    >
                      <div style="font-size: 0.75rem; color: #64748b; font-weight: 600;">
                        生效模型 (MODEL)
                      </div>
                      <div
                        style="
                          font-size: 0.88rem;
                          font-weight: 600;
                          color: #4f46e5;
                          margin-top: 6px;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          white-space: nowrap;
                        "
                        :title="llmConfig?.model"
                      >
                        {{ llmConfig?.model || '未设定' }}
                      </div>
                    </div>

                    <div
                      style="
                        background: #f8fafc;
                        padding: 14px 16px;
                        border-radius: 10px;
                        border: 1px solid rgba(15, 23, 42, 0.05);
                      "
                    >
                      <div style="font-size: 0.75rem; color: #64748b; font-weight: 600;">
                        API 密钥 (API KEY)
                      </div>
                      <div
                        style="
                          font-size: 0.88rem;
                          font-weight: 600;
                          color: #1e293b;
                          margin-top: 6px;
                        "
                      >
                        {{ llmConfig?.apiKeyMasked || (llmConfig?.hasApiKey ? '已配置 (密文)' : '未填写') }}
                      </div>
                    </div>
                  </div>

                  <template #action>
                    <div style="display: flex; justify-content: flex-end;">
                      <NButton
                        size="small"
                        type="primary"
                        secondary
                        @click.stop="isLlmConfigModalOpen = true"
                      >
                        修改详细配置
                      </NButton>
                    </div>
                  </template>
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
          @open-ai-edit="openAiEditor"
          @status-changed="loadSurveys"
        />

        <!-- 弹窗 3：发布问卷 Modal (组件化) -->
        <SurveyPublishModal
          v-model:show="isPublishModalOpen"
          @created="loadSurveys"
        />

        <!-- 弹窗 4：AI 问卷智造工坊 Modal -->
        <AiSurveyStudioModal v-model:show="isAiStudioOpen" @created="loadSurveys" />

        <!-- 弹窗 4.5：AI 问卷局部智能编辑 Modal -->
        <AiSurveyEditorModal
          v-model:show="isAiEditorModalOpen"
          :survey="selectedSurveyForAiEdit"
          @survey-updated="loadSurveys"
        />

        <!-- 弹窗 5：大模型服务接入配置 Modal -->
        <LlmConfigModal
          v-model:show="isLlmConfigModalOpen"
          @saved="(cfg) => (llmConfig = cfg)"
        />

        <!-- 管理员登录鉴权弹窗 (访问控制台强校验) -->
        <AuthModal
          v-model:show="showAuthModal"
          mode="admin"
          :closable="AuthClientService.isAdmin()"
          @success="onAdminLoginSuccess"
        />
      </NLayout>
    </NMessageProvider>
  </NNotificationProvider>
</NConfigProvider>
</template>

<style scoped>
.console-workspace-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  gap: 12px;
  min-height: 0;
}

.console-filter-bar-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: 10px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  flex-shrink: 0;
}

.console-survey-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.empty-survey-box {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: 80px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.console-pagination-footer-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: 10px 18px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.footer-total-text {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}
</style>
