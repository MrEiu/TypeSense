<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { QuestionnaireRepositoryService } from '../services/questionnaire-repository-service';
import type { QuestionnaireModel } from '../schema/questionnaire-schema-types';
import SurveyFlowCanvas from '../canvas/components/SurveyFlowCanvas.vue';

const DEFAULT_DEMO_SURVEY: QuestionnaireModel = {
  id: 'survey_demo_dag',
  title: 'TypeSense 全景流程拓扑示范问卷',
  description: '展示有向无环图 (DAG) 拓扑结构、题目自组织布局与分支跳转逻辑。',
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      title: '您目前主要的工程研发方向是什么？',
      required: true,
      options: ['Web 前端 / 体验架构', '服务端 / 分布式系统', '全栈开发', 'AI Agent / 智能体工程'],
      jump: [
        { when: { q1: 0 }, to: 'q2' },
        { when: { q1: 1 }, to: 'q3' },
        { when: { q1: 3 }, to: 'q4' },
        { else: true, to: 'q2' },
      ],
    },
    {
      id: 'q2',
      type: 'multiple_choice',
      title: '您在日常前端工程中重点关注的模块：',
      required: true,
      options: ['自组织流程画布', 'TypeScript 严苛契约', '轻量级状态机', '高性能微动效'],
    },
    {
      id: 'q3',
      type: 'multiple_choice',
      title: '您在服务端核心关注的技术特性：',
      required: true,
      options: ['高并发 WAL 日志', 'SQLite 原生引擎', '流式 SSE 通信', '极简微服务网关'],
    },
    {
      id: 'q4',
      type: 'likert_scale',
      title: '您对“全景拓扑图能显著提升复杂业务流程可观测性”的认同程度：',
      required: true,
      options: ['完全不赞同', '不太赞同', '基本赞同', '非常赞同'],
    },
    {
      id: 'q5',
      type: 'text_input',
      title: '您对全景拓扑交互幕布有何期待或建议？',
      required: false,
      placeholder: '请输入您的建议...',
    },
  ],
};

const isLoading = ref(true);
const currentSurveyId = ref('survey_tech_2026');
const questionnaire = ref<QuestionnaireModel>(DEFAULT_DEMO_SURVEY);
const allSurveys = ref<Array<{ id: string; title: string }>>([]);

const respondentUrl = computed(() => {
  return `/survey.html?id=${encodeURIComponent(currentSurveyId.value)}`;
});

async function loadSurvey(id: string) {
  isLoading.value = true;
  currentSurveyId.value = id;
  try {
    const fetched = await QuestionnaireRepositoryService.getSurvey(id);
    questionnaire.value = fetched;
  } catch (err) {
    console.warn(`[AdminApp] 装载问卷 ${id} 失败，使用兜底问卷:`, err);
    questionnaire.value = DEFAULT_DEMO_SURVEY;
  } finally {
    isLoading.value = false;
  }
}

function handleSelectChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  if (target?.value) {
    loadSurvey(target.value);
  }
}

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const requestedId = urlParams.get('id') || urlParams.get('survey');

  try {
    const list = await QuestionnaireRepositoryService.listSurveys();
    allSurveys.value = list.map((s) => ({ id: s.id, title: s.title }));

    if (requestedId) {
      await loadSurvey(requestedId);
    } else if (list.length > 0) {
      await loadSurvey(list[0].id);
    } else {
      questionnaire.value = DEFAULT_DEMO_SURVEY;
      isLoading.value = false;
    }
  } catch {
    questionnaire.value = DEFAULT_DEMO_SURVEY;
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="admin-app-container">
    <!-- 管理端顶栏 -->
    <header class="admin-canvas-header">
      <div class="admin-header-brand">
        <span class="brand-badge">ADMIN</span>
        <span class="brand-title">TypeSense 流程拓扑幕布 · {{ questionnaire.title }}</span>
      </div>

      <div class="admin-header-actions">
        <!-- 切换问卷下拉选框 -->
        <div v-if="allSurveys.length > 1" class="survey-select-wrapper">
          <select class="survey-selector" :value="currentSurveyId" @change="handleSelectChange">
            <option v-for="s in allSurveys" :key="s.id" :value="s.id">
              {{ s.title }}
            </option>
          </select>
        </div>

        <a href="/" class="action-pill-btn" title="返回发布控制台">
          <span>← 返回控制台</span>
        </a>
        <a :href="respondentUrl" target="_blank" class="action-pill-btn" title="在受访端作答">
          <span>↗ 受访作答</span>
        </a>
      </div>
    </header>

    <!-- 画布主体区 -->
    <main class="admin-canvas-stage">
      <div v-if="isLoading" class="admin-canvas-loading">
        <div class="canvas-spinner"></div>
        <p>正在计算拓扑并载入幕布...</p>
      </div>
      <SurveyFlowCanvas
        v-else
        :key="currentSurveyId"
        :questionnaire="questionnaire"
      />
    </main>
  </div>
</template>

<style scoped>
.admin-app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #060911;
  color: #f8fafc;
  overflow: hidden;
}

.admin-canvas-header {
  height: 56px;
  padding: 0 20px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 30;
  backdrop-filter: blur(12px);
}

.admin-header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  font-weight: 800;
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 2px 7px;
  border-radius: 4px;
}

.brand-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 0.3px;
}

.admin-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.survey-select-wrapper {
  position: relative;
}

.survey-selector {
  height: 32px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 0.8rem;
  outline: none;
  cursor: pointer;
}

.survey-selector option {
  background: #0f172a;
  color: #f8fafc;
}

.action-pill-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
}

.action-pill-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.45);
  color: #fff;
}

.admin-canvas-stage {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.admin-canvas-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #94a3b8;
  font-size: 0.9rem;
}

.canvas-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
