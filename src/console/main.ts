/**
 * src/console/main.ts
 *
 * 问卷管理控制台 Vue 3 核心入口
 * 集成现代国际化 UI 生态 (PrimeVue Aura + Radix Vue + Naive UI)
 */
import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ConsoleApp from './ConsoleApp.vue';
import '../styles/theme.css';

const app = createApp(ConsoleApp);

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: false || '.dark',
      cssLayer: false,
    },
  },
});

app.mount('#app');
