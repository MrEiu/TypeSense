<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

defineProps<{
  data: {
    title: string;
    description: string;
  };
  sourcePosition?: Position;
}>();
</script>

<template>
  <div class="canvas-node start-node">
    <div class="node-header">
      <span class="node-badge badge-start">START · 问卷引导</span>
    </div>
    <div class="node-title">{{ data.title }}</div>
    <div class="node-desc">{{ data.description }}</div>
    <Handle type="source" :position="sourcePosition || Position.Right" class="flow-handle handle-source" />
  </div>
</template>

<style scoped>
.canvas-node {
  width: 360px;
  background: rgba(15, 23, 42, 0.9);
  border: 1.5px solid rgba(99, 102, 241, 0.4);
  border-radius: 14px;
  padding: 16px 20px;
  color: #f8fafc;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  position: relative;
  transition: border-color 0.2s, transform 0.2s;
}

.start-node {
  border-color: rgba(99, 102, 241, 0.6);
  background: linear-gradient(135deg, rgba(30, 27, 75, 0.85), rgba(15, 23, 42, 0.95));
}

.start-node:hover {
  border-color: #818cf8;
}

.node-header {
  margin-bottom: 8px;
}

.node-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-start {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.node-title {
  font-size: 1rem;
  font-weight: 700;
  color: #f8fafc;
  margin-bottom: 4px;
  line-height: 1.35;
}

.node-desc {
  font-size: 0.8rem;
  color: #94a3b8;
  line-height: 1.4;
}

.flow-handle {
  width: 10px;
  height: 10px;
  background: #6366f1;
  border: 2px solid #0f172a;
  border-radius: 50%;
}
</style>
