<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    readonly?: boolean;
  }>(),
  {
    modelValue: '',
    placeholder: '',
    rows: 3,
    disabled: false,
    readonly: false,
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
  const val = (e.target as HTMLTextAreaElement).value;
  emit('update:modelValue', val);
}

function handleChange(e: Event) {
  const val = (e.target as HTMLTextAreaElement).value;
  emit('change', val);
}
</script>

<template>
  <div
    class="ts-textarea-wrap"
    :class="{
      'is-focused': isFocused,
      'is-disabled': disabled,
      'is-readonly': readonly,
    }"
  >
    <textarea
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      class="ts-textarea__inner"
      @input="handleInput"
      @change="handleChange"
      @focus="(e) => { isFocused = true; emit('focus', e); }"
      @blur="(e) => { isFocused = false; emit('blur', e); }"
    ></textarea>
  </div>
</template>

<style scoped>
.ts-textarea-wrap {
  width: 100%;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.ts-textarea-wrap:hover:not(.is-disabled):not(.is-readonly) {
  border-color: rgba(15, 23, 42, 0.22);
}

.ts-textarea-wrap.is-focused {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.ts-textarea-wrap.is-disabled {
  background: #f8fafc;
  opacity: 0.6;
  cursor: not-allowed;
}

.ts-textarea__inner {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: 0.82rem;
  color: #0f172a;
  line-height: 1.5;
  resize: vertical;
  padding: 0;
  display: block;
}

.ts-textarea__inner::placeholder {
  color: #94a3b8;
}
</style>
