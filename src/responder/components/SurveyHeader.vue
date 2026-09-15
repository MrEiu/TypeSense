<script setup lang="ts">
/**
 * src/responder/components/SurveyHeader.vue
 *
 * Minimalist Zen Paper respondent header bar.
 * Renders top progress bar, brand identity, AI quick-fill entry, and user authentication badge.
 */

import { Sparkles } from 'lucide-vue-next';
import type { UserProfile } from '../../services/auth-client-service';
import type { QuestionnaireModel } from '../../schema/questionnaire-schema-types';

defineProps<{
  stage: 'welcome' | 'question' | 'completed' | 'disqualified';
  progressPercentage: number;
  survey: QuestionnaireModel | null;
  currentUser: UserProfile | null;
}>();

const emit = defineEmits<{
  (e: 'open-ai-fill'): void;
  (e: 'open-auth'): void;
  (e: 'logout'): void;
}>();
</script>

<template>
  <div>
    <!-- Top progress bar (only visible during question stage) -->
    <div v-if="stage === 'question'" class="header-progress-wrap">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${progressPercentage}%` }"></div>
      </div>
    </div>

    <!-- Responder navigation bar -->
    <header class="responder-nav-bar">
      <div class="nav-brand">
        <span class="brand-spark">⚡</span>
        <span class="brand-title">TypeSense</span>
      </div>

      <div class="nav-user-area">
        <!-- AI chat quick-fill launcher -->
        <button
          v-if="survey && stage !== 'completed' && stage !== 'disqualified'"
          type="button"
          class="nav-ai-btn"
          title="通过与 AI 自然交流提炼问卷答案"
          @click="emit('open-ai-fill')"
        >
          <Sparkles class="nav-ai-icon" />
          <span>AI 对话速填</span>
        </button>

        <!-- Authenticated user info -->
        <template v-if="currentUser">
          <div class="user-badge">
            <span class="user-indicator"></span>
            <span class="user-name">当前受访者：<strong>{{ currentUser.username }}</strong></span>
            <button class="user-btn-ghost" title="退出并切换账号" @click="emit('logout')">
              退出
            </button>
          </div>
        </template>
        <!-- Unauthenticated login button -->
        <template v-else>
          <button class="user-login-cta" @click="emit('open-auth')">
            登录 / 注册受访者账号
          </button>
        </template>
      </div>
    </header>
  </div>
</template>

<style scoped>
.header-progress-wrap {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(15, 23, 42, 0.04);
  z-index: 100;
}

.progress-track {
  width: 100%;
  height: 100%;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--zen-primary, #4f46e5);
  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 8px rgba(79, 70, 229, 0.4);
}

.responder-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(15, 23, 42, 0.05);
  position: relative;
  z-index: 50;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-spark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: #4f46e5;
  color: #fff;
  border-radius: 6px;
  font-size: 0.85rem;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
}

.brand-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.nav-user-area {
  display: flex;
  align-items: center;
}

.nav-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(124, 58, 237, 0.12));
  border: 1px solid rgba(124, 58, 237, 0.25);
  color: #6366f1;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  margin-right: 12px;
  transition: all 0.2s ease;
  outline: none;
}

.nav-ai-btn:hover {
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(124, 58, 237, 0.22));
  color: #4f46e5;
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.2);
}

.nav-ai-icon {
  width: 14px;
  height: 14px;
}

.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.user-indicator {
  width: 7px;
  height: 7px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.user-name {
  font-size: 0.84rem;
  color: #475569;
}

.user-name strong {
  color: #0f172a;
}

.user-btn-ghost {
  background: transparent;
  border: none;
  font-size: 0.8rem;
  color: #64748b;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.user-btn-ghost:hover {
  background: #f1f5f9;
  color: #dc2626;
}

.user-login-cta {
  background: #4f46e5;
  color: #ffffff;
  border: none;
  font-size: 0.84rem;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
}

.user-login-cta:hover {
  background: #4338ca;
  transform: translateY(-1px);
}
</style>
