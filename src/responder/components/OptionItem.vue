<script setup lang="ts">
import { computed } from 'vue';
import { Check } from 'lucide-vue-next';

const props = defineProps<{
  label: string;
  index: number;
  selected?: boolean;
  disabled?: boolean;
  multiple?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const alphabetKey = computed(() => {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  return letters[props.index] || String(props.index + 1);
});

function handleClick() {
  if (!props.disabled) {
    emit('select');
  }
}
</script>

<template>
  <div
    class="option-item-card"
    :class="{ 'is-selected': selected, 'is-disabled': disabled }"
    @click="handleClick"
  >
    <div class="key-badge">
      <span v-if="!selected">{{ alphabetKey }}</span>
      <Check v-else :size="15" stroke-width="3" class="check-icon" />
    </div>

    <div class="option-label">
      {{ label }}
    </div>
  </div>
</template>

<style scoped>
.option-item-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 22px;
  background: #ffffff;
  border: 1.5px solid rgba(15, 23, 42, 0.09);
  border-radius: 14px;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transform: translateY(0);
  transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.16s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.16s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

.option-item-card:hover:not(.is-disabled) {
  transform: translateY(-2px);
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 8px 20px -4px rgba(79, 70, 229, 0.08);
}

.option-item-card:active:not(.is-disabled) {
  transform: scale(0.975);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.option-item-card.is-selected {
  background: #f5f3ff;
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1, 0 8px 20px -4px rgba(99, 102, 241, 0.12);
}

.key-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: #f1f5f9;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
  flex-shrink: 0;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

.option-item-card.is-selected .key-badge {
  background: #6366f1;
  color: #ffffff;
  border-color: #6366f1;
}

.check-icon {
  animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.option-label {
  font-size: 1.05rem;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.5;
  flex-grow: 1;
}

.option-item-card.is-selected .option-label {
  color: #4338ca;
  font-weight: 600;
}

.option-item-card.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes popIn {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
