<script setup lang="ts">
import { NButton } from 'naive-ui';
import { ArrowRight, FileText, CheckCircle2 } from 'lucide-vue-next';

defineProps<{
  title: string;
  description?: string;
  questionsCount: number;
}>();

const emit = defineEmits<{
  (e: 'start'): void;
}>();
</script>

<template>
  <div class="welcome-card-box">
    <div class="welcome-badge">
      <FileText :size="15" />
      <span>正式调研问卷</span>
    </div>

    <h1 class="welcome-title">
      {{ title }}
    </h1>

    <p v-if="description" class="welcome-description">
      {{ description }}
    </p>

    <div class="welcome-action-row">
      <NButton
        type="primary"
        size="large"
        class="zen-primary-btn"
        @click="emit('start')"
      >
        <span class="btn-text">开始答题</span>
        <template #icon>
          <ArrowRight :size="18" />
        </template>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.welcome-card-box {
  max-width: 680px;
  margin: 0 auto;
  padding: 48px 40px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.06);
}

.welcome-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #4f46e5;
  margin-bottom: 20px;
}

.welcome-title {
  font-size: 1.85rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.35;
  margin: 0 0 16px 0;
  letter-spacing: -0.02em;
}

.welcome-description {
  font-size: 1.05rem;
  color: #475569;
  line-height: 1.68;
  margin: 0 0 28px 0;
}

.welcome-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 36px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 10px;
  font-size: 0.88rem;
  color: #64748b;
}

.meta-icon {
  color: #10b981;
}

.welcome-action-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

:deep(.zen-primary-btn) {
  height: 48px;
  padding: 0 28px;
  border-radius: 12px;
  font-size: 1.02rem;
  font-weight: 600;
  background-color: #4f46e5 !important;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
  transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.16s ease;
}

:deep(.zen-primary-btn:hover) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.45);
}

:deep(.zen-primary-btn:active) {
  transform: scale(0.97);
}

.key-hint {
  font-size: 0.88rem;
  color: #94a3b8;
}

.kbd-badge {
  display: inline-block;
  padding: 2px 7px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #475569;
  font-family: inherit;
  font-weight: 600;
}
</style>
