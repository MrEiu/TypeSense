/**
 * admin.ts
 *
 * 管理端流程拓扑幕布主入口 (admin.html)
 * 职责：挂载 AdminCanvasApp Vue 3 应用，渲染基于 Vue Flow 的全景问卷有向图拓扑。
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
