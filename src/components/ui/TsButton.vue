<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
    disabled?: boolean;
    loading?: boolean;
    as?: string;
    href?: string;
    target?: string;
    block?: boolean;
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    disabled: false,
    loading: false,
    as: 'button',
    block: false,
  }
);

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const componentTag = computed(() => {
  if (props.href) return 'a';
  return props.as || 'button';
});

function handleClick(e: MouseEvent) {
  if (props.disabled || props.loading) {
    e.preventDefault();
    return;
  }
  emit('click', e);
}
</script>

<template>
  <component
    :is="componentTag"
    :href="href"
    :target="target"
    :disabled="disabled || loading"
    class="ts-btn"
    :class="[
      `ts-btn--${variant}`,
      `ts-btn--${size}`,
      { 'is-loading': loading, 'is-disabled': disabled, 'is-block': block },
    ]"
    @click="handleClick"
  >
    <span v-if="loading" class="ts-btn__spinner"></span>
    <span class="ts-btn__content">
      <slot />
    </span>
  </component>
</template>

<style scoped>
.ts-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
  font-family: inherit;
  font-weight: 600;
  text-decoration: none;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  vertical-align: middle;
  outline: none;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  line-height: 1.2;
}

.ts-btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.22);
}

.ts-btn:active:not(.is-disabled):not(.is-loading) {
  transform: scale(0.98);
}

/* 尺寸规范 */
.ts-btn--xs {
  height: 24px;
  padding: 0 8px;
  font-size: 0.72rem;
  border-radius: 6px;
}

.ts-btn--sm {
  height: 28px;
  padding: 0 10px;
  font-size: 0.78rem;
  border-radius: 6px;
}

.ts-btn--md {
  height: 32px;
  padding: 0 14px;
  font-size: 0.82rem;
  border-radius: 8px;
}

.ts-btn--lg {
  height: 38px;
  padding: 0 18px;
  font-size: 0.88rem;
  border-radius: 9px;
}

.ts-btn--icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
}

.ts-btn--xs.ts-btn--icon {
  width: 24px;
  height: 24px;
  border-radius: 5px;
}

.ts-btn--sm.ts-btn--icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.is-block {
  display: flex;
  width: 100%;
}

/* 变体主题 */
/* Primary: 旗舰靛蓝光泽 */
.ts-btn--primary {
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  color: #ffffff;
  border-color: rgba(79, 70, 229, 0.8);
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.ts-btn--primary:hover:not(.is-disabled):not(.is-loading) {
  background: linear-gradient(135deg, #4338ca 0%, #4f46e5 100%);
  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.35);
  transform: translateY(-1px);
}

/* Secondary: Zen 纸质高级灰白 */
.ts-btn--secondary {
  background: #ffffff;
  color: #334155;
  border-color: rgba(15, 23, 42, 0.11);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.ts-btn--secondary:hover:not(.is-disabled):not(.is-loading) {
  background: #f8fafc;
  color: #0f172a;
  border-color: rgba(15, 23, 42, 0.18);
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.06);
}

/* Outline: 简约边框 */
.ts-btn--outline {
  background: transparent;
  color: #475569;
  border-color: rgba(15, 23, 42, 0.14);
}

.ts-btn--outline:hover:not(.is-disabled):not(.is-loading) {
  background: #f8fafc;
  color: #0f172a;
  border-color: rgba(15, 23, 42, 0.25);
}

/* Ghost: 无边框轻盈 */
.ts-btn--ghost {
  background: transparent;
  color: #64748b;
  border-color: transparent;
}

.ts-btn--ghost:hover:not(.is-disabled):not(.is-loading) {
  background: #f1f5f9;
  color: #0f172a;
}

/* Danger: 警示红 */
.ts-btn--danger {
  background: #fff5f5;
  color: #dc2626;
  border-color: rgba(239, 68, 68, 0.25);
}

.ts-btn--danger:hover:not(.is-disabled):not(.is-loading) {
  background: #fee2e2;
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.4);
}

/* Success: 成功绿 */
.ts-btn--success {
  background: #ecfdf5;
  color: #059669;
  border-color: rgba(16, 185, 129, 0.25);
}

.ts-btn--success:hover:not(.is-disabled):not(.is-loading) {
  background: #d1fae5;
  color: #047857;
  border-color: rgba(16, 185, 129, 0.4);
}

/* 禁用与加载 */
.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.is-loading {
  cursor: wait;
}

.ts-btn__content {
  display: inline-flex;
  align-items: center;
  gap: inherit;
}

.ts-btn__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ts-spin 0.6s linear infinite;
}

@keyframes ts-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
