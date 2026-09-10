/**
 * admin.ts
 *
 * TypeSense Studio 问卷逻辑与智能编排工作台主入口 (admin.html)
 * 职责：挂载 AdminCanvasApp Vue 3 应用，支持大纲编辑、Jump 条件配置、流程拓扑与即时真机模拟。
 */

import { createApp } from 'vue';
import AdminCanvasApp from './admin/AdminCanvasApp.vue';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('admin-app');
  if (root) {
    const app = createApp(AdminCanvasApp);
    app.mount(root);
  }
});
