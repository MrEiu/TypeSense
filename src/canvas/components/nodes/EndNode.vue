<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

defineProps<{
  data: {
    title: string;
    description: string;
  };
  targetPosition?: Position;
}>();
</script>

<template>
  <div class="canvas-node end-node">
    <Handle type="target" :position="targetPosition || Position.Left" class="flow-handle handle-target" />
    <div class="node-header">
      <span class="node-badge badge-end">END · 完成收束</span>
    </div>
    <div class="node-title">{{ data.title }}</div>
    <div class="node-desc">{{ data.description }}</div>
  </div>
</template>

<style scoped>
.canvas-node {
  width: 360px;
  background: rgba(15, 23, 42, 0.9);
  border: 1.5px solid rgba(16, 185, 129, 0.4);
  border-radius: 14px;
  padding: 16px 20px;
  color: #f8fafc;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  position: relative;
  transition: border-color 0.2s;
}

.end-node {
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.45), rgba(15, 23, 42, 0.95));
}

.end-node:hover {
  border-color: #34d399;
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

.badge-end {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.4);
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
  background: #10b981;
  border: 2px solid #0f172a;
  border-radius: 50%;
}
</style>
