<script setup lang="ts">
import { NButton } from 'naive-ui';
import { ShieldAlert, RotateCcw } from 'lucide-vue-next';

defineProps<{
  reason?: string;
}>();

const emit = defineEmits<{
  (e: 'restart'): void;
}>();
</script>

<template>
  <div class="disqualified-card-box">
    <div class="shield-icon-wrap">
      <ShieldAlert :size="36" stroke-width="2.2" />
    </div>

    <h2 class="disqualified-title">调研受众甄别结束</h2>
    <p class="disqualified-subtitle">
      {{ reason || '感谢您的关注与支持！根据当前填报的技术决策角色或业务特征，您暂时未命中本次全景调研的目标受访群体。' }}
    </p>

    <div class="action-row">
      <NButton
        size="large"
        class="restart-btn"
        @click="emit('restart')"
      >
        <template #icon>
          <RotateCcw :size="16" />
        </template>
        <span>重新选择角色</span>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.disqualified-card-box {
  max-width: 620px;
  margin: 0 auto;
  padding: 56px 40px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  text-align: center;
  box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.06);
}

.shield-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  background: #fef2f2;
  color: #ef4444;
  border-radius: 20px;
  margin-bottom: 24px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.disqualified-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 12px 0;
}

.disqualified-subtitle {
  font-size: 1.02rem;
  color: #64748b;
  line-height: 1.65;
  margin: 0 0 32px 0;
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
