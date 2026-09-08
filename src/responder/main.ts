/**
 * src/responder/main.ts
 *
 * 受访者端 Vue 3 + Naive UI 入口装配脚本
 */
import { createApp } from 'vue';
import SurveyApp from './SurveyApp.vue';
import '../styles/theme.css';

const app = createApp(SurveyApp);
app.mount('#app');
