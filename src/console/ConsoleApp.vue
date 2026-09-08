<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  useMessage,
  NButton,
  NCard,
  NTag,
  NGrid,
  NGridItem,
  NModal,
  NInput,
  NSpace,
  NPopconfirm,
  NTooltip,
  NSpin,
  type GlobalThemeOverrides,
} from 'naive-ui';
import {
  Plus,
  ExternalLink,
  Share2,
  Trash2,
  Layers,
  Database,
  Copy,
  Check,
  FileQuestion,
  Sparkles,
  Radio,
} from 'lucide-vue-next';

import {
  QuestionnaireRepositoryService,
  type SurveyMetadataItem,
} from '../services/questionnaire-repository-service';
import type { QuestionnaireModel } from '../schema/questionnaire-schema-types';
import AiSurveyStudioModal from './components/AiSurveyStudioModal.vue';

// Naive UI Zen Paper 主题配置
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#4f46e5',
    primaryColorHover: '#4338ca',
    primaryColorPressed: '#3730a3',
    primaryColorSuppl: '#4f46e5',
    borderRadius: '12px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  Card: {
    borderRadius: '14px',
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  Button: {
    fontWeight: '600',
    borderRadiusMedium: '10px',
  },
};

const surveys = ref<SurveyMetadataItem[]>([]);
const loading = ref(true);
const isPublishModalOpen = ref(false);
const isPublishing = ref(false);
const publishJsonText = ref('');
const copiedSurveyId = ref<string | null>(null);
const isAiStudioOpen = ref(false);

// 短链弹窗状态
const shortLinkModalOpen = ref(false);
const currentShortLink = ref('');
const currentSurveyTitle = ref('');

// 计算属性
const totalResponses = computed(() => {
  return surveys.value.reduce((sum, s) => sum + (s.responseCount || 0), 0);
});

// 加载问卷列表
async function loadSurveys() {
  loading.value = true;
  try {
    surveys.value = await QuestionnaireRepositoryService.listSurveys();
  } catch (err) {
    console.error('[ConsoleApp] 加载问卷失败:', err);
  } finally {
    loading.value = false;
  }
}

// 打开短链弹窗并生成
async function handleGenerateShortLink(survey: SurveyMetadataItem) {
  try {
    currentSurveyTitle.value = survey.title;
    const link = await QuestionnaireRepositoryService.generateShortLink(survey.slug || survey.id);
    currentShortLink.value = link;
    shortLinkModalOpen.value = true;
  } catch (err) {
    console.error('生成短链失败:', err);
  }
}

// 快速复制链接
async function copyLink(link: string, id: string) {
  try {
    await navigator.clipboard.writeText(link);
    copiedSurveyId.value = id;
    setTimeout(() => {
      if (copiedSurveyId.value === id) {
        copiedSurveyId.value = null;
      }
    }, 2000);
  } catch (err) {
    console.error('复制链接失败:', err);
  }
}

// 删除问卷
async function handleDeleteSurvey(survey: SurveyMetadataItem) {
  try {
    const success = await QuestionnaireRepositoryService.deleteSurvey(survey.slug || survey.id);
    if (success) {
      await loadSurveys();
    }
  } catch (err) {
    console.error('删除问卷失败:', err);
  }
}

// 打开快速发布模态框
function openPublishModal() {
  publishJsonText.value = JSON.stringify(
    {
      id: `survey_custom_${Date.now()}`,
      title: '2026 全球前沿工程师体验调研',
      description: '探讨现代化工具链、全栈工程化体验与团队工程文化。',
      questions: [
        {
          id: 'q1_role',
          title: '您当前在团队中主要负责的核心角色是？',
          type: 'single_choice',
          required: true,
          options: [
            { id: 'fe', label: '前端 / 体验架构师' },
            { id: 'be', label: '后端 / 平台系统研发' },
            { id: 'fullstack', label: '全栈独立开发者' },
            { id: 'lead', label: '技术负责人 / 团队管理者' },
          ],
        },
        {
          id: 'q2_fe_stack',
          title: '前端选型中，您最看重的维度是？',
          type: 'single_choice',
          required: true,
          visible: {
            target: 'q1_role',
            operator: 'in',
            value: [0, 2],
          },
          options: [
            { id: 'dx', label: '极速 DX 与无感 HMR' },
            { id: 'perf', label: '零运行时与高执行性能' },
            { id: 'ecosystem', label: '成熟完整的生态组件库' },
          ],
        },
        {
          id: 'q3_feedback',
          title: '您对目前工具链最大的痛点或期待是什么？',
          type: 'text_input',
          required: false,
          placeholder: '例如：构建配置繁琐、类型推断慢...',
        },
      ],
    },
    null,
    2
  );
  isPublishModalOpen.value = true;
}

// 提交发布
async function handlePublishSubmit() {
  try {
    isPublishing.value = true;
    const parsed = JSON.parse(publishJsonText.value) as QuestionnaireModel;
    await QuestionnaireRepositoryService.publishSurvey(parsed);
    isPublishModalOpen.value = false;
    await loadSurveys();
  } catch (err) {
    alert(`发布失败: ${(err as Error).message}`);
  } finally {
    isPublishing.value = false;
  }
}

onMounted(() => {
  loadSurveys();
});
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="console-wrapper">
        <!-- 顶栏导航 -->
        <header class="console-navbar">
          <div class="navbar-brand">
            <div class="brand-badge-icon">⚡</div>
            <div class="brand-text-block">
              <h1 class="brand-title">TypeSense 控制台</h1>
              <span class="brand-subtitle">轻量流转问卷引擎 · 真实 SQLite 持久化</span>
            </div>
          </div>

          <div class="navbar-actions">
            <button class="nav-ai-btn" @click="isAiStudioOpen = true">
              <Sparkles class="btn-icon" />
              <span>AI 智造问卷</span>
            </button>
            <a href="/admin.html" class="nav-ghost-btn" title="查看拓扑流程画布">
              <Layers class="btn-icon" />
              <span>流程拓扑幕布</span>
            </a>
            <button class="nav-primary-btn" @click="openPublishModal">
              <Plus class="btn-icon" />
              <span>发布新问卷</span>
            </button>
          </div>
        </header>

        <!-- 主内容区 -->
        <main class="console-main">
          <!-- 统计概览卡片行 -->
          <div class="stats-overview-grid">
            <div class="stat-box">
              <div class="stat-icon-wrap" style="background: #eef2ff; color: #4f46e5;">
                <FileQuestion class="stat-icon" />
              </div>
              <div class="stat-meta">
                <div class="stat-num">{{ surveys.length }}</div>
                <div class="stat-lbl">已发布问卷总数</div>
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-icon-wrap" style="background: #ecfdf5; color: #10b981;">
                <Check class="stat-icon" />
              </div>
              <div class="stat-meta">
                <div class="stat-num">{{ totalResponses }}</div>
                <div class="stat-lbl">SQLite 已收录有效答卷</div>
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-icon-wrap" style="background: #fdf4ff; color: #a855f7;">
                <Database class="stat-icon" />
              </div>
              <div class="stat-meta">
                <div class="stat-num">SQLite 3 (WAL)</div>
                <div class="stat-lbl">数据持久化引擎已就绪</div>
              </div>
            </div>
          </div>

          <!-- 问卷列表区域 -->
          <section class="survey-section">
            <div class="section-header">
              <div>
                <h2 class="section-title">问卷与分发通道</h2>
                <p class="section-desc">每个问卷均由 SQLite 分配全局唯一短码，支持一键作答与拓扑编排。</p>
              </div>
            </div>

            <!-- 加载状态 -->
            <div v-if="loading" class="loading-state">
              <NSpin size="large" />
            </div>

            <!-- 问卷卡片网格 -->
            <div v-else class="survey-card-grid">
              <div v-for="item in surveys" :key="item.id" class="survey-card">
                <!-- 头部状态栏 -->
                <div class="card-top-bar">
                  <span class="status-pill published">
                    <span class="dot"></span>
                    <span>已发布</span>
                  </span>
                  <span class="date-text">{{ new Date(item.createdAt).toLocaleDateString() }}</span>
                </div>

                <!-- 标题与简介 -->
                <h3 class="card-title" :title="item.title">{{ item.title }}</h3>
                <p class="card-desc">
                  {{ item.description || '暂无说明，包含分支流向与动态条件计算。' }}
                </p>

                <!-- 属性标签 -->
                <div class="card-tags-row">
                  <span class="badge-item">
                    <strong>{{ item.questionsCount }}</strong> 题
                  </span>
                  <span class="badge-item">
                    <strong>{{ item.responseCount }}</strong> 份作答
                  </span>
                  <span class="badge-item code-badge">
                    {{ item.slug }}
                  </span>
                </div>

                <!-- 动作按键组 -->
                <div class="card-actions-row">
                  <!-- 进入作答 -->
                  <a
                    :href="`/survey.html?id=${encodeURIComponent(item.slug || item.id)}`"
                    target="_blank"
                    class="action-btn play-btn"
                  >
                    <span>体验作答</span>
                    <ExternalLink class="btn-micro-icon" />
                  </a>

                  <!-- 生成短链 -->
                  <button
                    class="action-btn link-btn"
                    title="生成算法分发短链"
                    @click="handleGenerateShortLink(item)"
                  >
                    <Share2 class="btn-micro-icon" />
                    <span>短链</span>
                  </button>

                  <!-- 拓扑幕布 -->
                  <a
                    :href="`/admin.html?id=${encodeURIComponent(item.slug || item.id)}`"
                    class="action-btn canvas-btn"
                    title="进入全景流程幕布"
                  >
                    <Layers class="btn-micro-icon" />
                    <span>画布</span>
                  </a>

                  <!-- 删除 -->
                  <NPopconfirm
                    @positive-click="handleDeleteSurvey(item)"
                    positive-text="确认删除"
                    negative-text="取消"
                  >
                    <template #trigger>
                      <button class="action-btn delete-btn" title="下线并删除问卷">
                        <Trash2 class="btn-micro-icon" />
                      </button>
                    </template>
                    确定要从 SQLite 数据库永久删除此问卷及其作答记录吗？
                  </NPopconfirm>
                </div>
              </div>
            </div>
          </section>
        </main>

        <!-- 弹窗 1：发布问卷 Modal -->
        <NModal
          v-model:show="isPublishModalOpen"
          preset="card"
          title="发布新问卷到 SQLite 数据库"
          style="max-width: 680px; width: 92%;"
        >
          <p style="color: var(--zen-text-secondary); font-size: 0.9rem; margin-top: 0;">
            粘贴符合 TypeSense Schema 规范的 JSON 配置，系统将自动校验拓扑并入库持久化。
          </p>
          <NInput
            v-model:value="publishJsonText"
            type="textarea"
            :rows="14"
            placeholder="粘贴问卷 JSON 结构..."
            style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;"
          />
          <template #footer>
            <div style="display: flex; justify-content: flex-end; gap: 12px;">
              <NButton @click="isPublishModalOpen = false">取消</NButton>
              <NButton type="primary" :loading="isPublishing" @click="handlePublishSubmit">
                即刻发布入库
              </NButton>
            </div>
          </template>
        </NModal>

        <!-- 弹窗 2：专属短链 Modal -->
        <NModal
          v-model:show="shortLinkModalOpen"
          preset="card"
          title="问卷专属访问通道"
          style="max-width: 520px; width: 92%;"
        >
          <p style="color: var(--zen-text-secondary); font-size: 0.92rem; margin-top: 0;">
            针对 <strong>{{ currentSurveyTitle }}</strong> 由后端算法生成的高性能重定向分发短链：
          </p>

          <div class="short-link-display-box">
            <input readonly :value="currentShortLink" class="short-link-input" />
            <button class="copy-action-btn" @click="copyLink(currentShortLink, 'modal')">
              <Check v-if="copiedSurveyId === 'modal'" class="btn-micro-icon" style="color: #10b981;" />
              <Copy v-else class="btn-micro-icon" />
              <span>{{ copiedSurveyId === 'modal' ? '已复制' : '复制' }}</span>
            </button>
          </div>

          <template #footer>
            <div style="display: flex; justify-content: flex-end;">
              <NButton type="primary" @click="shortLinkModalOpen = false">完成</NButton>
            </div>
          </template>
        </NModal>

        <!-- 弹窗 3：AI 问卷智造工坊 Modal -->
        <AiSurveyStudioModal v-model:show="isAiStudioOpen" @created="loadSurveys" />
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.console-wrapper {
  min-height: 100vh;
  background-color: var(--zen-bg);
  color: var(--zen-text-primary);
  display: flex;
  flex-direction: column;
}

/* 顶栏 */
.console-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 36px;
  background: var(--zen-surface);
  border-bottom: 1px solid var(--zen-border);
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(8px);
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-badge-icon {
  width: 38px;
  height: 38px;
  background: #eef2ff;
  color: var(--zen-primary);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 800;
}

.brand-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: 0.8rem;
  color: var(--zen-text-muted);
  display: block;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: var(--zen-radius-sm);
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: none;
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--zen-transition-fast);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}

.nav-ai-btn:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.45);
}

.nav-ai-btn:active {
  transform: scale(0.97);
}

.nav-ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--zen-radius-sm);
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  color: var(--zen-text-secondary);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  transition: all var(--zen-transition-fast);
}

.nav-ghost-btn:hover {
  background: var(--zen-surface-hover);
  color: var(--zen-text-primary);
}

.nav-primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: var(--zen-radius-sm);
  background: var(--zen-primary);
  border: none;
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--zen-transition-fast);
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
}

.nav-primary-btn:hover {
  background: var(--zen-primary-hover);
  transform: translateY(-1px);
}

.btn-icon {
  width: 16px;
  height: 16px;
}

/* 主内容 */
.console-main {
  flex: 1;
  max-width: 1180px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 80px 24px;
}

/* 统计卡片 */
.stats-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 36px;
}

.stat-box {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: var(--zen-radius-md);
  padding: 20px 24px;
  box-shadow: var(--zen-shadow-sm);
}

.stat-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon {
  width: 24px;
  height: 24px;
}

.stat-num {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--zen-text-primary);
  line-height: 1.2;
}

.stat-lbl {
  font-size: 0.85rem;
  color: var(--zen-text-muted);
  font-weight: 500;
  margin-top: 2px;
}

/* 问卷列表 */
.survey-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.section-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.section-desc {
  margin: 4px 0 0 0;
  font-size: 0.88rem;
  color: var(--zen-text-muted);
}

.loading-state {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

/* 问卷卡片网格 */
.survey-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.survey-card {
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: var(--zen-radius-md);
  padding: 22px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--zen-shadow-sm);
  transition: transform var(--zen-transition-fast), box-shadow var(--zen-transition-fast), border-color var(--zen-transition-fast);
}

.survey-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--zen-shadow-md);
  border-color: var(--zen-border-hover);
}

.card-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--zen-radius-full);
}

.status-pill.published {
  background: var(--zen-success-subtle);
  color: var(--zen-success);
}

.status-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.date-text {
  font-size: 0.78rem;
  color: var(--zen-text-muted);
}

.card-title {
  margin: 0 0 8px 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--zen-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-desc {
  margin: 0 0 16px 0;
  font-size: 0.88rem;
  color: var(--zen-text-secondary);
  line-height: 1.5;
  flex-grow: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.badge-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  background: #f1f5f9;
  color: var(--zen-text-secondary);
  padding: 4px 10px;
  border-radius: 6px;
}

.badge-item.code-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--zen-text-muted);
}

.card-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--zen-border);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.84rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--zen-border);
  text-decoration: none;
  cursor: pointer;
  background: var(--zen-surface);
  color: var(--zen-text-secondary);
  transition: all var(--zen-transition-fast);
}

.action-btn:hover {
  background: var(--zen-surface-hover);
  color: var(--zen-text-primary);
}

.action-btn.play-btn {
  background: var(--zen-primary);
  border-color: var(--zen-primary);
  color: #ffffff;
  flex: 1;
}

.action-btn.play-btn:hover {
  background: var(--zen-primary-hover);
}

.action-btn.delete-btn {
  color: var(--zen-danger);
  border-color: rgba(239, 68, 68, 0.2);
}

.action-btn.delete-btn:hover {
  background: var(--zen-danger-subtle);
}

.btn-micro-icon {
  width: 14px;
  height: 14px;
}

/* 短链弹窗样式 */
.short-link-display-box {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.short-link-input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--zen-border);
  background: #f8fafc;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.88rem;
  color: var(--zen-text-primary);
  outline: none;
}

.copy-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  background: var(--zen-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: background 0.15s;
}

.copy-action-btn:hover {
  background: var(--zen-primary-hover);
}
</style>
