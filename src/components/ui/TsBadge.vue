<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
    size?: 'sm' | 'md';
    dot?: boolean;
    pulse?: boolean;
  }>(),
  {
    variant: 'neutral',
    size: 'md',
    dot: false,
    pulse: false,
  }
);
</script>

<template>
  <span
    class="ts-badge"
    :class="[`ts-badge--${variant}`, `ts-badge--${size}`]"
  >
    <span v-if="dot" class="ts-badge__dot" :class="{ 'is-pulse': pulse }"></span>
    <span class="ts-badge__text">
      <slot />
    </span>
  </span>
</template>

<style scoped>
.ts-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 9999px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  user-select: none;
}

.ts-badge--sm {
  font-size: 0.7rem;
  padding: 1px 6px;
}

.ts-badge--md {
  font-size: 0.76rem;
  padding: 2px 8px;
}

.ts-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.ts-badge__dot.is-pulse {
  animation: ts-pulse 2s infinite ease-in-out;
}

@keyframes ts-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.35);
    opacity: 0.5;
  }
}

/* 语义色 */
.ts-badge--primary {
  background: #eef2ff;
  color: #4f46e5;
}

.ts-badge--success {
  background: #ecfdf5;
  color: #059669;
}

.ts-badge--warning {
  background: #fffbeb;
  color: #d97706;
}

.ts-badge--danger {
  background: #fef2f2;
  color: #dc2626;
}

.ts-badge--info {
  background: #f0f9ff;
  color: #0284c7;
}

.ts-badge--neutral {
  background: #f1f5f9;
  color: #475569;
}
</style>
