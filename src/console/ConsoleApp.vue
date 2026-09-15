<script setup lang="ts">
/**
 * src/console/ConsoleApp.vue
 *
 * Admin Console main orchestrator.
 * Combines ConsoleHeader, ConsoleSider, SurveyFilterToolbar, SurveyCardGrid,
 * SurveyTableList, and operation modals.
 */

import { ref, onMounted } from 'vue';
import {
  NConfigProvider,
  NNotificationProvider,
  NMessageProvider,
  NLayout,
  NCard,
  NSpin,
  NEmpty,
  NPagination,
  type GlobalThemeOverrides,
} from 'naive-ui';
import {
  Sparkles,
  Search,
} from 'lucide-vue-next';

import {
  QuestionnaireRepositoryService,
  type SurveyMetadataItem,
} from '../services/questionnaire-repository-service';
import { AuthClientService, type UserProfile } from '../services/auth-client-service';
import { SystemConfigService, type AiSystemConfig } from '../services/system-config-service';
import { TsButton } from '../components/ui';

import { useConsoleSurveys } from '../composables/useConsoleSurveys';
import ConsoleHeader from './components/ConsoleHeader.vue';
import ConsoleSider from './components/ConsoleSider.vue';
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

// Naive UI Zen Paper theme overrides
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

// Authentication state
const currentUser = ref<UserProfile | null>(AuthClientService.getUser());
const showAuthModal = ref(!AuthClientService.isAdmin());

// Console surveys composable
const {
  surveys,
  loading,
  searchQuery,
  currentFilterTab,
  sortBy,
  viewMode,
  currentPage,
  pageSize,
  filteredSurveys,
  paginatedSurveys,
  loadSurveys,
  toggleSurveyStatus,
  deleteSurvey,
} = useConsoleSurveys();

// Navigation and modal states
const activeMenuKey = ref('all_surveys');
const isSiderCollapsed = ref(false);
const isPublishModalOpen = ref(false);
const isAiStudioOpen = ref(false);
const isAiEditorModalOpen = ref(false);
const selectedSurveyForAiEdit = ref<SurveyMetadataItem | null>(null);

const isResponsesDrawerOpen = ref(false);
const isDetailDrawerOpen = ref(false);
const selectedSurvey = ref<SurveyMetadataItem | null>(null);

const isLlmConfigModalOpen = ref(false);
const llmConfig = ref<AiSystemConfig | null>(null);
const loadingLlmConfig = ref(false);

async function loadLlmConfig() {
  loadingLlmConfig.value = true;
  try {
    llmConfig.value = await SystemConfigService.getConfig();
  } catch (err) {
    console.error('[ConsoleApp] Failed to get LLM config:', err);
  } finally {
    loadingLlmConfig.value = false;
  }
}

function openAiEditor(survey: SurveyMetadataItem) {
  selectedSurveyForAiEdit.value = survey;
  isAiEditorModalOpen.value = true;
}

function handleMenuSelect(key: string) {
  activeMenuKey.value = key;
  if (key === 'ai_studio') {
    isAiStudioOpen.value = true;
  } else if (key === 'system_settings') {
    loadLlmConfig();
  }
}

function openResponsesDrawer(survey: SurveyMetadataItem) {
  selectedSurvey.value = survey;
  isResponsesDrawerOpen.value = true;
}

function openDetailDrawer(survey: SurveyMetadataItem) {
  selectedSurvey.value = survey;
  isDetailDrawerOpen.value = true;
}

async function handleCopySlug(survey: SurveyMetadataItem) {
  await navigator.clipboard.writeText(survey.slug || survey.id);
}

async function handleCopyLink(survey: SurveyMetadataItem) {
  const link = QuestionnaireRepositoryService.generateAccessUrl(survey.slug || survey.id);
  await navigator.clipboard.writeText(link);
}

async function handleDeleteSurvey(survey: SurveyMetadataItem) {
  await deleteSurvey(survey);
}

function onAdminLoginSuccess(user: UserProfile) {
  currentUser.value = user;
  showAuthModal.value = false;
  loadSurveys();
  loadLlmConfig();
}

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
        <NLayout
          has-sider
          style="height: 100vh; width: 100vw; overflow: hidden; background-color: var(--zen-bg, #f8fafc);"
          content-style="height: 100%; width: 100%; display: flex; overflow: hidden;"
        >
          <!-- Collapsible Left Sider -->
          <ConsoleSider
            :active-menu-key="activeMenuKey"
            :is-sider-collapsed="isSiderCollapsed"
            @update:is-sider-collapsed="(val) => (isSiderCollapsed = val)"
            @select-menu="handleMenuSelect"
          />

          <!-- Right Framework -->
          <div style="flex: 1; min-width: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; background-color: var(--zen-bg, #f8fafc);">
            <!-- Top Header -->
            <ConsoleHeader
              :active-menu-key="activeMenuKey"
              :filtered-surveys-count="filteredSurveys.length"
              :search-query="searchQuery"
              :loading="loading"
              :loading-llm-config="loadingLlmConfig"
              :current-user="currentUser"
              @update:search-query="(val) => (searchQuery = val)"
              @refresh-surveys="loadSurveys"
              @refresh-llm-config="loadLlmConfig"
              @open-ai-studio="isAiStudioOpen = true"
              @open-llm-config="isLlmConfigModalOpen = true"
              @logout="handleLogout"
            />

            <!-- Main Content Container -->
            <div style="flex: 1; min-height: 0; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column;">
              <!-- 1. Survey Management View -->
              <div v-if="activeMenuKey === 'all_surveys'" style="display: flex; flex-direction: column; gap: 20px; flex: 1;">
                <!-- Filter Toolbar -->
                <SurveyFilterToolbar
                  :current-tab="currentFilterTab"
                  :sort-by="sortBy"
                  :view-mode="viewMode"
                  :total-count="surveys.length"
                  :filtered-count="filteredSurveys.length"
                  @update:current-tab="(tab) => (currentFilterTab = tab)"
                  @update:sort-by="(sort) => (sortBy = sort)"
                  @update:view-mode="(mode) => (viewMode = mode)"
                />

                <!-- Loading State -->
                <div v-if="loading" style="display: flex; justify-content: center; align-items: center; padding: 80px 0;">
                  <NSpin size="large" />
                </div>

                <!-- Empty State -->
                <div v-else-if="filteredSurveys.length === 0" style="padding: 60px 0; text-align: center;">
                  <NCard style="max-width: 480px; margin: 0 auto; text-align: center; padding: 32px 20px;">
                    <NEmpty :description="searchQuery ? '未检索到匹配的问卷' : '暂无问卷资产'">
                      <template #extra>
                        <TsButton
                          variant="primary"
                          size="md"
                          style="margin-top: 12px;"
                          @click="isAiStudioOpen = true"
                        >
                          <Sparkles style="width: 14px; height: 14px;" />
                          <span>通过 AI 智造第一份问卷</span>
                        </TsButton>
                      </template>
                    </NEmpty>
                  </NCard>
                </div>

                <!-- Content Grid or Table View -->
                <div v-else style="display: flex; flex-direction: column; gap: 20px;">
                  <SurveyCardGrid
                    v-if="viewMode === 'grid'"
                    :surveys="paginatedSurveys"
                    @toggle-status="toggleSurveyStatus"
                    @open-responses="openResponsesDrawer"
                    @open-detail="openDetailDrawer"
                    @copy-slug="handleCopySlug"
                    @copy-link="handleCopyLink"
                    @delete-survey="handleDeleteSurvey"
                    @open-ai-edit="openAiEditor"
                  />
                  <SurveyTableList
                    v-else
                    :surveys="paginatedSurveys"
                    @toggle-status="toggleSurveyStatus"
                    @open-responses="openResponsesDrawer"
                    @open-detail="openDetailDrawer"
                    @copy-slug="handleCopySlug"
                    @copy-link="handleCopyLink"
                    @delete-survey="handleDeleteSurvey"
                    @open-ai-edit="openAiEditor"
                  />

                  <!-- Pagination -->
                  <div v-if="filteredSurveys.length > pageSize" style="display: flex; justify-content: flex-end; padding: 12px 0;">
                    <NPagination
                      v-model:page="currentPage"
                      :page-size="pageSize"
                      :item-count="filteredSurveys.length"
                      show-quick-jumper
                    />
                  </div>
                </div>
              </div>

              <!-- 2. System Settings View -->
              <div v-else-if="activeMenuKey === 'system_settings'" style="max-width: 800px; display: flex; flex-direction: column; gap: 20px;">
                <NCard title="大模型与服务提供商设置">
                  <p style="color: #64748b; font-size: 13px; margin: 0 0 16px 0;">
                    配置系统核心的大模型 API Key、提供商（硅基流动 SiliconFlow、DeepSeek、阿里云百炼、OpenAI 等）以及全局温度参数。
                  </p>
                  <TsButton variant="primary" size="md" @click="isLlmConfigModalOpen = true">
                    打开大模型配置面板
                  </TsButton>
                </NCard>
              </div>
            </div>
          </div>
        </NLayout>

        <!-- Operation Modals & Drawers -->
        <SurveyPublishModal
          v-model:show="isPublishModalOpen"
          :survey="selectedSurvey"
          @survey-created="loadSurveys"
        />

        <SurveyResponsesDrawer
          v-model:show="isResponsesDrawerOpen"
          :survey="selectedSurvey"
        />

        <SurveyDetailDrawer
          v-model:show="isDetailDrawerOpen"
          :survey="selectedSurvey"
        />

        <AiSurveyStudioModal
          v-model:show="isAiStudioOpen"
          @created="loadSurveys"
        />

        <AiSurveyEditorModal
          v-model:show="isAiEditorModalOpen"
          :survey="selectedSurveyForAiEdit"
          @survey-updated="loadSurveys"
        />

        <LlmConfigModal
          v-model:show="isLlmConfigModalOpen"
          @config-updated="loadLlmConfig"
        />

        <AuthModal
          v-model:show="showAuthModal"
          mode="admin"
          :closable="AuthClientService.isAdmin()"
          @success="onAdminLoginSuccess"
        />
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>
