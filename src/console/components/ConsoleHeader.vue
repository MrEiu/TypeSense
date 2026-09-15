<script setup lang="ts">
/**
 * src/console/components/ConsoleHeader.vue
 *
 * Admin Console top header bar.
 * Contains page title, keyword search, refresh, quick create survey, and admin auth controls.
 */

import {
  NLayoutHeader,
  NTag,
  NInput,
  NTooltip,
  NButton,
} from 'naive-ui';
import {
  Search,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  LogOut,
  Cpu,
} from 'lucide-vue-next';
import { TsButton } from '../../components/ui';
import type { UserProfile } from '../../services/auth-client-service';

defineProps<{
  activeMenuKey: string;
  filteredSurveysCount: number;
  searchQuery: string;
  loading: boolean;
  loadingLlmConfig: boolean;
  currentUser: UserProfile | null;
}>();

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void;
  (e: 'refresh-surveys'): void;
  (e: 'refresh-llm-config'): void;
  (e: 'open-ai-studio'): void;
  (e: 'open-llm-config'): void;
  (e: 'logout'): void;
}>();
</script>

<template>
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
        {{ filteredSurveysCount }} 份问卷
      </NTag>
      <NTag v-else-if="activeMenuKey === 'system_settings'" size="small" type="info" :bordered="false" round>
        大模型与服务参数
      </NTag>
    </div>

    <!-- Header actions -->
    <div style="display: flex; align-items: center; gap: 12px;">
      <!-- Survey search and creation for all_surveys -->
      <template v-if="activeMenuKey === 'all_surveys'">
        <NInput
          :value="searchQuery"
          placeholder="搜索问卷标题或短码..."
          clearable
          size="small"
          style="width: 240px;"
          @update:value="(val) => emit('update:searchQuery', val)"
        >
          <template #prefix>
            <Search style="width: 14px; height: 14px; color: #94a3b8;" />
          </template>
        </NInput>

        <NTooltip trigger="hover">
          <template #trigger>
            <NButton size="small" quaternary :loading="loading" @click="emit('refresh-surveys')">
              <template #icon>
                <RefreshCw style="width: 15px; height: 15px;" />
              </template>
            </NButton>
          </template>
          重新从 SQLite 数据库同步
        </NTooltip>

        <!-- Model config launcher -->
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton size="small" quaternary @click="emit('open-llm-config')">
              <template #icon>
                <Cpu style="width: 15px; height: 15px; color: #6366f1;" />
              </template>
            </NButton>
          </template>
          配置大模型 API 与服务提供商
        </NTooltip>

        <!-- New survey button (AI Studio launcher) -->
        <TsButton
          variant="primary"
          size="sm"
          title="创建新问卷 (AI 智造工坊)"
          @click="emit('open-ai-studio')"
        >
          <Sparkles style="width: 13px; height: 13px;" />
          <span>新建问卷</span>
        </TsButton>
      </template>

      <!-- System settings mode -->
      <template v-else-if="activeMenuKey === 'system_settings'">
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton size="small" quaternary :loading="loadingLlmConfig" @click="emit('refresh-llm-config')">
              <template #icon>
                <RefreshCw style="width: 15px; height: 15px;" />
              </template>
            </NButton>
          </template>
          重新获取最新系统配置
        </NTooltip>
      </template>

      <!-- Admin status and logout -->
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
            <NButton size="small" quaternary @click="emit('logout')">
              <template #icon>
                <LogOut style="width: 14px; height: 14px; color: #64748b;" />
              </template>
            </NButton>
          </template>
          退出管理会话
        </NTooltip>
      </div>
    </div>
  </NLayoutHeader>
</template>
