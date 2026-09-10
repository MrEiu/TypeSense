<script setup lang="ts">
import { ref } from 'vue';
import { X } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    type?: string;
    size?: 'sm' | 'md' | 'lg';
    clearable?: boolean;
    bold?: boolean;
  }>(),
  {
    modelValue: '',
    placeholder: '',
    disabled: false,
    readonly: false,
    type: 'text',
    size: 'md',
    clearable: false,
    bold: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'change', val: string): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
}>();

const isFocused = ref(false);

function handleInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  emit('update:modelValue', val);
}

function handleChange(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  emit('change', val);
}

function handleClear() {
  emit('update:modelValue', '');
  emit('change', '');
}
</script>

<template>
  <div
    class="ts-input-wrap"
    :class="[
      `ts-input--${size}`,
      {
        'is-focused': isFocused,
        'is-disabled': disabled,
        'is-readonly': readonly,
        'is-bold': bold,
      },
    ]"
  >
    <div v-if="$slots.prefix" class="ts-input__prefix">
      <slot name="prefix" />
    </div>

    <input
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      class="ts-input__inner"
      @input="handleInput"
      @change="handleChange"
      @focus="(e) => { isFocused = true; emit('focus', e); }"
      @blur="(e) => { isFocused = false; emit('blur', e); }"
    />

    <button
      v-if="clearable && modelValue && !disabled && !readonly"
      type="button"
      class="ts-input__clear"
      tabindex="-1"
      @click="handleClear"
    >
      <X style="width: 12px; height: 12px;" />
    </button>

    <div v-if="$slots.suffix" class="ts-input__suffix">
      <slot name="suffix" />
    </div>
  </div>
</template>

<style scoped>
.ts-input-wrap {
  display: inline-flex;
  align-items: center;
  position: relative;
  width: 100%;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  color: #0f172a;
}

.ts-input-wrap:hover:not(.is-disabled):not(.is-readonly) {
  border-color: rgba(15, 23, 42, 0.22);
}

.ts-input-wrap.is-focused {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.ts-input-wrap.is-disabled {
  background: #f8fafc;
  opacity: 0.6;
  cursor: not-allowed;
}

.ts-input-wrap.is-readonly {
  background: #f8fafc;
}

/* 尺寸规范 */
.ts-input--sm {
  height: 28px;
  padding: 0 8px;
  font-size: 0.78rem;
  border-radius: 6px;
}

.ts-input--md {
  height: 34px;
  padding: 0 10px;
  font-size: 0.84rem;
  border-radius: 8px;
}

.ts-input--lg {
  height: 40px;
  padding: 0 12px;
  font-size: 0.92rem;
  border-radius: 9px;
}

.ts-input__inner {
  flex: 1;
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  padding: 0;
}

.is-bold .ts-input__inner {
  font-weight: 600;
}

.ts-input__inner::placeholder {
  color: #94a3b8;
}

.ts-input__prefix,
.ts-input__suffix {
  display: inline-flex;
  align-items: center;
  color: #64748b;
  flex-shrink: 0;
}

.ts-input__prefix {
  margin-right: 6px;
}

.ts-input__suffix {
  margin-left: 6px;
}

.ts-input__clear {
  border: none;
  background: transparent;
  padding: 2px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  margin-left: 4px;
  transition: all 0.12s;
}

.ts-input__clear:hover {
  background: #f1f5f9;
  color: #1e293b;
}
</style>
