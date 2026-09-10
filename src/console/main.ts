/**
 * src/console/main.ts
 *
 * 问卷管理控制台 Vue 3 核心入口
 */
import { createApp } from 'vue';
import ConsoleApp from './ConsoleApp.vue';
import '../styles/theme.css';

const app = createApp(ConsoleApp);

app.mount('#app');
