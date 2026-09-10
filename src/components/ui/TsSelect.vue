<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ChevronDown, Check } from 'lucide-vue-next';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    options: SelectOption[];
    placeholder?: string;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    highlight?: boolean;
    block?: boolean;
  }>(),
  {
    modelValue: '',
    placeholder: '请选择...',
    size: 'md',
    disabled: false,
    highlight: false,
    block: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: string | number): void;
  (e: 'change', val: string | number): void;
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);

const selectedOption = computed(() => {
  return props.options.find((opt) => opt.value === props.modelValue);
});

function toggleDropdown() {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
}

function handleSelect(opt: SelectOption) {
  if (opt.disabled) return;
  emit('update:modelValue', opt.value);
  emit('change', opt.value);
  isOpen.value = false;
}

function handleDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (
    triggerRef.value &&
    !triggerRef.value.contains(target) &&
    dropdownRef.value &&
    !dropdownRef.value.contains(target)
  ) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<template>
  <div
    ref="triggerRef"
    class="ts-select-root"
    :class="[
      `ts-select--${size}`,
      {
        'is-open': isOpen,
        'is-disabled': disabled,
        'is-highlight': highlight,
        'is-block': block,
      },
    ]"
  >
    <!-- 选择器触发框 -->
    <div
      class="ts-select__trigger"
      tabindex="0"
      @click="toggleDropdown"
      @keydown.enter="toggleDropdown"
      @keydown.space.prevent="toggleDropdown"
    >
      <span class="ts-select__label" :class="{ 'is-placeholder': !selectedOption }">
        {{ selectedOption ? selectedOption.label : placeholder }}
      </span>
      <ChevronDown class="ts-select__arrow" style="width: 13px; height: 13px;" />
    </div>

    <!-- 现代轻奢浮动下拉面板 -->
    <div
      v-show="isOpen"
      ref="dropdownRef"
      class="ts-select__dropdown"
    >
      <div class="ts-select__options-list">
        <div
          v-for="opt in options"
          :key="opt.value"
          class="ts-select__option"
          :class="{
            'is-selected': opt.value === modelValue,
            'is-disabled': opt.disabled,
          }"
          @click="handleSelect(opt)"
        >
          <span class="ts-select__opt-text">{{ opt.label }}</span>
          <Check
            v-if="opt.value === modelValue"
            class="ts-select__opt-check"
            style="width: 13px; height: 13px;"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts-select-root {
  display: inline-block;
  position: relative;
  user-select: none;
  font-family: inherit;
  box-sizing: border-box;
}

.ts-select-root.is-block {
  display: block;
  width: 100%;
}

.ts-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;
  color: #0f172a;
}

.ts-select__trigger:hover:not(.is-disabled) {
  border-color: rgba(15, 23, 42, 0.22);
}

.ts-select-root.is-open .ts-select__trigger {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.ts-select-root.is-highlight .ts-select__trigger {
  border-color: rgba(79, 70, 229, 0.4);
  color: #4f46e5;
  font-weight: 600;
}

.ts-select-root.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* 尺寸规范 */
.ts-select--sm .ts-select__trigger {
  height: 28px;
  padding: 0 8px;
  font-size: 0.78rem;
  border-radius: 6px;
}

.ts-select--md .ts-select__trigger {
  height: 32px;
  padding: 0 10px;
  font-size: 0.82rem;
  border-radius: 8px;
}

.ts-select--lg .ts-select__trigger {
  height: 38px;
  padding: 0 12px;
  font-size: 0.88rem;
  border-radius: 9px;
}

.ts-select__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.ts-select__label.is-placeholder {
  color: #94a3b8;
}

.ts-select__arrow {
  color: #94a3b8;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.ts-select-root.is-open .ts-select__arrow {
  transform: rotate(180deg);
  color: #4f46e5;
}

/* 下拉面板 */
.ts-select__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: 320px;
  max-height: 240px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.04);
  z-index: 999;
  overflow-y: auto;
  padding: 4px;
  animation: ts-drop-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes ts-drop-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ts-select__options-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ts-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #334155;
  cursor: pointer;
  transition: all 0.12s ease;
}

.ts-select__option:hover:not(.is-disabled) {
  background: #f1f5f9;
  color: #0f172a;
}

.ts-select__option.is-selected {
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 600;
}

.ts-select__option.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ts-select__opt-check {
  color: #4f46e5;
  flex-shrink: 0;
}
</style>
