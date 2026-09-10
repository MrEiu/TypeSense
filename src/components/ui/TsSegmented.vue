<script setup lang="ts">
import { h } from 'vue';

export interface SegmentOption {
  label: string;
  value: string | number;
  icon?: any;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: SegmentOption[];
    size?: 'sm' | 'md';
  }>(),
  {
    size: 'md',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: string | number): void;
  (e: 'change', val: string | number): void;
}>();

function select(val: string | number) {
  emit('update:modelValue', val);
  emit('change', val);
}
</script>

<template>
  <div class="ts-segmented" :class="`ts-segmented--${size}`">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="ts-segmented__item"
      :class="{ 'is-active': opt.value === modelValue }"
      @click="select(opt.value)"
    >
      <component
        :is="opt.icon"
        v-if="opt.icon"
        class="ts-segmented__icon"
        style="width: 14px; height: 14px;"
      />
      <span class="ts-segmented__label">{{ opt.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.ts-segmented {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
  user-select: none;
  box-sizing: border-box;
}

.ts-segmented__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  outline: none;
}

.ts-segmented--sm .ts-segmented__item {
  padding: 3px 8px;
  font-size: 0.76rem;
}

.ts-segmented--md .ts-segmented__item {
  padding: 5px 12px;
  font-size: 0.8rem;
}

.ts-segmented__item:hover:not(.is-active) {
  color: #0f172a;
}

.ts-segmented__item.is-active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.ts-segmented__icon {
  flex-shrink: 0;
}
</style>
