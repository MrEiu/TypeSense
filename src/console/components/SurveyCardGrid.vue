<script setup lang="ts">
import { ref } from 'vue';
import {
  NGrid,
  NGridItem,
  NCard,
  NTag,
  NSwitch,
  NSpace,
  NButton,
  NDropdown,
  NTooltip,
} from 'naive-ui';
import {
  ExternalLink,
  BarChart3,
  Share2,
  MoreHorizontal,
  Copy,
  Check,
  Calendar,
  Layers,
} from 'lucide-vue-next';
import type { SurveyMetadataItem } from '../../services/questionnaire-repository-service';

defineProps<{
  surveys: SurveyMetadataItem[];
}>();

const emit = defineEmits<{
  (e: 'open-responses', survey: SurveyMetadataItem): void;
  (e: 'open-detail', survey: SurveyMetadataItem): void;
  (e: 'toggle-status', survey: SurveyMetadataItem, active: boolean): void;
  (e: 'delete', survey: SurveyMetadataItem): void;
  (e: 'copy-slug', survey: SurveyMetadataItem): void;
  (e: 'copy-link', survey: SurveyMetadataItem): void;
}>();

const copiedSlugId = ref<string | null>(null);

async function handleCopySlug(survey: SurveyMetadataItem) {
  try {
    await navigator.clipboard.writeText(survey.slug || survey.id);
    copiedSlugId.value = survey.id;
    setTimeout(() => {
      if (copiedSlugId.value === survey.id) {
        copiedSlugId.value = null;
      }
    }, 1600);
  } catch {
    emit('copy-slug', survey);
  }
}

function getDropdownOptions() {
  return [
    {
      label: '复制短码 Slug',
      key: 'copy_slug',
    },
    {
      label: '复制直接访问链接',
      key: 'copy_link',
    },
    {
      type: 'divider',
      key: 'd1',
    },
    {
      label: '从 SQLite 数据库删除',
      key: 'delete',
    },
  ];
}

function handleDropdownSelect(key: string, survey: SurveyMetadataItem) {
  if (key === 'copy_slug') {
    emit('copy-slug', survey);
  } else if (key === 'copy_link') {
    emit('copy-link', survey);
  } else if (key === 'delete') {
    emit('delete', survey);
  }
}
</script>

<template>
  <NGrid :cols="2" :x-gap="18" :y-gap="18">
    <NGridItem v-for="item in surveys" :key="item.id">
      <div class="studio-survey-card">
        <!-- 卡片头部：状态开关与发布日期 -->
        <div class="card-header-row">
          <div class="status-indicator-group">
            <NSwitch
              size="small"
              :value="item.status !== 'paused'"
              @update:value="(val) => emit('toggle-status', item, val)"
            />
            <div
              class="status-capsule"
              :class="item.status !== 'paused' ? 'is-active' : 'is-paused'"
            >
              <span class="status-dot"></span>
              <span class="status-label">
                {{ item.status !== 'paused' ? '收集中' : '已暂停' }}
              </span>
            </div>
          </div>

          <div class="meta-date">
            <Calendar style="width: 12px; height: 12px; opacity: 0.7;" />
            <span>{{ new Date(item.createdAt).toLocaleDateString() }}</span>
          </div>
        </div>

        <!-- 卡片主体：标题与描述 -->
        <div class="card-body-section">
          <h3 class="survey-title-text" :title="item.title">
            {{ item.title }}
          </h3>
          <p class="survey-desc-text">
            {{ item.description || '暂无说明，包含分支流向与动态条件计算。' }}
          </p>

          <!-- 属性微徽章池 -->
          <div class="badge-pill-row">
            <!-- 题数 -->
            <span class="metric-pill">
              <strong>{{ item.questionsCount }}</strong> 题
            </span>

            <!-- 作答数 -->
            <span
              class="metric-pill"
              :class="(item.responseCount || 0) > 0 ? 'highlight-responses' : ''"
            >
              <strong>{{ item.responseCount || 0 }}</strong> 份作答
            </span>

            <!-- 算法短码 (支持点击即时复制) -->
            <NTooltip trigger="hover">
              <template #trigger>
                <button class="slug-copy-pill" @click="handleCopySlug(item)">
                  <Check
                    v-if="copiedSlugId === item.id"
                    style="width: 11px; height: 11px; color: #10b981;"
                  />
                  <Copy v-else style="width: 11px; height: 11px; opacity: 0.7;" />
                  <span>{{ copiedSlugId === item.id ? '已复制' : (item.slug || item.id) }}</span>
                </button>
              </template>
              点击一键复制问卷唯一短码
            </NTooltip>
          </div>
        </div>

        <!-- 卡片底部：操作按键组 (发布、数据、体验、编排) -->
        <div class="card-footer-actions">
          <div class="main-action-buttons">
            <!-- 1. 发布 (短链与二维码分发) -->
            <button
              class="action-btn-item action-btn-publish"
              title="查看问卷分发短链与扫码二维码"
              @click="emit('open-detail', item)"
            >
              <Share2 style="width: 13px; height: 13px; color: #4f46e5;" />
              <span>发布</span>
            </button>

            <!-- 2. 数据 (作答看板与答卷流水) -->
            <button
              class="action-btn-item action-btn-data"
              title="查看问卷作答流水与统计数据"
              @click="emit('open-responses', item)"
            >
              <BarChart3 style="width: 13px; height: 13px; color: #0284c7;" />
              <span>数据</span>
            </button>

            <!-- 3. 体验 (受访端真实作答) -->
            <a
              :href="`/survey.html?id=${encodeURIComponent(item.slug || item.id)}`"
              target="_blank"
              class="action-btn-item action-btn-experience"
              title="在受访端新窗口体验真实作答流程"
            >
              <ExternalLink style="width: 13px; height: 13px; color: #10b981;" />
              <span>体验</span>
            </a>

            <!-- 4. 编排 (智能工作台) -->
            <a
              :href="`/admin.html?id=${encodeURIComponent(item.slug || item.id)}`"
              target="_blank"
              class="action-btn-item action-btn-orchestrate"
              title="进入 TypeSense Studio 问卷逻辑与智能编排工作台"
            >
              <Layers style="width: 13px; height: 13px; color: #8b5cf6;" />
              <span>编排</span>
            </a>
          </div>

          <!-- 更多菜单 -->
          <NDropdown
            trigger="click"
            :options="getDropdownOptions()"
            @select="(key) => handleDropdownSelect(key, item)"
          >
            <button class="more-menu-btn" title="更多操作">
              <MoreHorizontal style="width: 14px; height: 14px;" />
            </button>
          </NDropdown>
        </div>
      </div>
    </NGridItem>
  </NGrid>
</template>

<style scoped>
/* Modern Studio 灵动轻奢卡片 */
.studio-survey-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

.studio-survey-card:hover {
  transform: translateY(-2.5px);
  border-color: rgba(79, 70, 229, 0.3);
  box-shadow: 0 12px 24px -4px rgba(15, 23, 42, 0.07), 0 4px 10px -2px rgba(15, 23, 42, 0.03);
}

/* 头部行 */
.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-indicator-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-capsule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
  user-select: none;
}

.status-capsule.is-active {
  background: #ecfdf5;
  color: #059669;
}

.status-capsule.is-paused {
  background: #fffbeb;
  color: #d97706;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-capsule.is-active .status-dot {
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.6;
  }
}

.meta-date {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: #94a3b8;
  font-weight: 500;
}

/* 主体内容 */
.card-body-section {
  flex: 1;
  margin-bottom: 16px;
}

.survey-title-text {
  margin: 0 0 6px 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.survey-desc-text {
  margin: 0 0 14px 0;
  font-size: 0.84rem;
  color: #64748b;
  line-height: 1.5;
  height: 38px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 徽章行 */
.badge-pill-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.metric-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: #f1f5f9;
  color: #475569;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
}

.metric-pill strong {
  color: #1e293b;
  font-weight: 700;
}

.metric-pill.highlight-responses {
  background: #ecfdf5;
  color: #059669;
}

.metric-pill.highlight-responses strong {
  color: #047857;
}

.slug-copy-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 6px;
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}

.slug-copy-pill:hover {
  background: #eef2ff;
  border-color: rgba(79, 70, 229, 0.3);
  color: #4f46e5;
}

/* 底部操作行 */
.card-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}

.main-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 统一精致操作按钮规范 */
.action-btn-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.09);
  color: #334155;
  font-size: 0.81rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02);
}

.action-btn-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 6px -1px rgba(15, 23, 42, 0.08);
}

/* 1. 发布按钮 */
.action-btn-publish:hover {
  background: #eef2ff;
  border-color: rgba(79, 70, 229, 0.35);
  color: #4338ca;
}

/* 2. 数据按钮 */
.action-btn-data:hover {
  background: #f0f9ff;
  border-color: rgba(2, 132, 199, 0.35);
  color: #0369a1;
}

/* 3. 体验按钮 */
.action-btn-experience:hover {
  background: #ecfdf5;
  border-color: rgba(16, 185, 129, 0.35);
  color: #047857;
}

/* 4. 编排按钮 */
.action-btn-orchestrate:hover {
  background: #faf5ff;
  border-color: rgba(139, 92, 246, 0.35);
  color: #6d28d9;
}

.more-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.more-menu-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}
</style>
