/**
 * src/console/main.ts
 *
 * 问卷管理控制台 Vue 3 + Naive UI 入口脚本
 */
import { createApp } from 'vue';
import ConsoleApp from './ConsoleApp.vue';
import '../styles/theme.css';

const app = createApp(ConsoleApp);
app.mount('#app');
