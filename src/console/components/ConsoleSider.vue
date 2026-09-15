<script setup lang="ts">
/**
 * src/console/components/ConsoleSider.vue
 *
 * Admin Console left sidebar.
 * Includes logo, collapsible navigation menu, and layout sider container.
 */

import { h } from 'vue';
import { NLayoutSider, NMenu, type MenuOption } from 'naive-ui';
import { FileQuestion, Settings } from 'lucide-vue-next';

defineProps<{
  activeMenuKey: string;
  isSiderCollapsed: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:isSiderCollapsed', val: boolean): void;
  (e: 'select-menu', key: string): void;
}>();

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
</script>

<template>
  <NLayoutSider
    bordered
    collapse-mode="width"
    :collapsed-width="68"
    :width="240"
    :collapsed="isSiderCollapsed"
    show-trigger
    style="background: #ffffff; z-index: 10;"
    @update:collapsed="(val) => emit('update:isSiderCollapsed', val)"
  >
    <div style="display: flex; flex-direction: column; height: 100%;">
      <!-- Brand title header -->
      <div
        style="
          height: 64px;
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 12px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.06);
        "
      >
        <div
          style="
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 800;
            font-size: 1rem;
            box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
            flex-shrink: 0;
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

      <!-- Sider navigation menu -->
      <div style="flex: 1; padding: 12px 0;">
        <NMenu
          :value="activeMenuKey"
          :collapsed="isSiderCollapsed"
          :collapsed-width="68"
          :collapsed-icon-size="20"
          :options="menuOptions"
          @update:value="(key) => emit('select-menu', key)"
        />
      </div>
    </div>
  </NLayoutSider>
</template>
