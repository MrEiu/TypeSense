<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
    label?: string;
  }>(),
  {
    modelValue: false,
    disabled: false,
    size: 'md',
    label: '',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'change', val: boolean): void;
}>();

function toggle() {
  if (props.disabled) return;
  const newVal = !props.modelValue;
  emit('update:modelValue', newVal);
  emit('change', newVal);
}
</script>

<template>
  <label
    class="ts-switch-wrap"
    :class="[
      `ts-switch--${size}`,
      { 'is-checked': modelValue, 'is-disabled': disabled },
    ]"
    @click.prevent="toggle"
  >
    <div class="ts-switch__track">
      <div class="ts-switch__thumb"></div>
    </div>
    <span v-if="label || $slots.default" class="ts-switch__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<style scoped>
.ts-switch-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  vertical-align: middle;
}

.ts-switch-wrap.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ts-switch__track {
  position: relative;
  border-radius: 9999px;
  background: #cbd5e1;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.ts-switch-wrap.is-checked .ts-switch__track {
  background: #4f46e5;
  box-shadow: 0 1px 3px rgba(79, 70, 229, 0.3);
}

.ts-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* 尺寸规范 */
.ts-switch--sm .ts-switch__track {
  width: 28px;
  height: 16px;
}
.ts-switch--sm .ts-switch__thumb {
  width: 12px;
  height: 12px;
}
.ts-switch--sm.is-checked .ts-switch__thumb {
  transform: translateX(12px);
}

.ts-switch--md .ts-switch__track {
  width: 36px;
  height: 20px;
}
.ts-switch--md .ts-switch__thumb {
  width: 16px;
  height: 16px;
}
.ts-switch--md.is-checked .ts-switch__thumb {
  transform: translateX(16px);
}
</style>
