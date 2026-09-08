<script setup lang="ts">
import { NButton } from 'naive-ui';
import { CheckCircle, RotateCcw, Database } from 'lucide-vue-next';

defineProps<{
  answers: Record<string, unknown>;
  responseId?: string;
}>();

const emit = defineEmits<{
  (e: 'restart'): void;
}>();
</script>

<template>
  <div class="completion-card-box">
    <div class="success-icon-wrap">
      <CheckCircle :size="36" stroke-width="2.2" />
    </div>

    <h2 class="completion-title">问卷作答已完成！</h2>
    <p class="completion-subtitle">
      非常感谢您的宝贵时间与专业洞见。您的作答数据已安全持久化存入 SQLite 数据库。
    </p>

    <div v-if="responseId" class="record-badge-row">
      <div class="record-pill">
        <Database :size="14" class="db-icon" />
        <span>唯一答卷流水号: <code>{{ responseId }}</code></span>
      </div>
    </div>

    <div class="action-row">
      <NButton
        size="large"
        class="restart-btn"
        @click="emit('restart')"
      >
        <template #icon>
          <RotateCcw :size="16" />
        </template>
        <span>重新作答</span>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.completion-card-box {
  max-width: 620px;
  margin: 0 auto;
  padding: 56px 40px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  text-align: center;
  box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.06);
}

.success-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  background: #ecfdf5;
  color: #10b981;
  border-radius: 20px;
  margin-bottom: 24px;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.completion-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 12px 0;
}

.completion-subtitle {
  font-size: 1.02rem;
  color: #64748b;
  line-height: 1.65;
  margin: 0 0 28px 0;
}

.record-badge-row {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.record-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  font-size: 0.85rem;
  color: #475569;
}

.record-pill code {
  color: #4f46e5;
  font-weight: 700;
}

.db-icon {
  color: #6366f1;
}

.action-row {
  display: flex;
  justify-content: center;
}

:deep(.restart-btn) {
  border-radius: 12px;
  font-weight: 600;
  padding: 0 24px;
}
</style>
