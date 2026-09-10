<script setup lang="ts">
withDefaults(
  defineProps<{
    hoverable?: boolean;
    padding?: 'none' | 'sm' | 'md' | 'lg';
    highlight?: boolean;
  }>(),
  {
    hoverable: false,
    padding: 'md',
    highlight: false,
  }
);
</script>

<template>
  <div
    class="ts-card"
    :class="[
      `ts-card--pad-${padding}`,
      { 'is-hoverable': hoverable, 'is-highlight': highlight },
    ]"
  >
    <slot />
  </div>
</template>

<style scoped>
.ts-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.ts-card.is-highlight {
  border-color: rgba(79, 70, 229, 0.25);
  background: #fafbff;
}

.ts-card.is-hoverable:hover {
  transform: translateY(-2px);
  border-color: rgba(79, 70, 229, 0.3);
  box-shadow: 0 10px 20px -3px rgba(15, 23, 42, 0.07), 0 4px 8px -2px rgba(15, 23, 42, 0.03);
}

.ts-card--pad-none {
  padding: 0;
}

.ts-card--pad-sm {
  padding: 10px 12px;
}

.ts-card--pad-md {
  padding: 16px 18px;
}

.ts-card--pad-lg {
  padding: 20px 24px;
}
</style>
