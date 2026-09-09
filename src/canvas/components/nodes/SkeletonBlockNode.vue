<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import type { PendingBlockInfo } from '../../services/questionnaire-graph-transformer';

defineProps<{
  data: {
    block: PendingBlockInfo;
  };
  targetPosition?: Position;
  sourcePosition?: Position;
}>();
</script>

<template>
  <div class="canvas-node skeleton-node">
    <Handle type="target" :position="targetPosition || Position.Left" class="flow-handle handle-target" />

    <div class="node-header">
      <span class="node-badge badge-skeleton">✨ 待生成题组块</span>
      <span class="count-tag">计划 {{ data.block.questionCount }} 题</span>
    </div>

    <div class="node-title">{{ data.block.name }}</div>

    <div class="skeleton-placeholder-box">
      <div class="skeleton-pulse-dot"></div>
      <span>{{ data.block.description || 'AI 智能体规划调研分面 · 推进时将在此裂变展开' }}</span>
    </div>

    <Handle type="source" :position="sourcePosition || Position.Right" class="flow-handle handle-source" />
  </div>
</template>

<style scoped>
.canvas-node {
  width: 400px;
  background: rgba(15, 23, 42, 0.85);
  border: 1.5px dashed rgba(99, 102, 241, 0.45);
  border-radius: 14px;
  padding: 16px 18px;
  color: #f8fafc;
  box-shadow: 0 6px 24px rgba(99, 102, 241, 0.1);
  backdrop-filter: blur(12px);
  position: relative;
  transition: all 0.2s;
}

.canvas-node:hover {
  border-color: #818cf8;
  box-shadow: 0 8px 30px rgba(99, 102, 241, 0.25);
}

.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.badge-skeleton {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.4);
}

.count-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: #94a3b8;
}

.node-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #f8fafc;
  margin-bottom: 10px;
}

.skeleton-placeholder-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(99, 102, 241, 0.2);
  border-radius: 8px;
  font-size: 0.8rem;
  color: #94a3b8;
  line-height: 1.4;
}

.skeleton-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #818cf8;
  flex-shrink: 0;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 0.3; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.3); }
}

.flow-handle {
  width: 10px;
  height: 10px;
  background: #a855f7;
  border: 2px solid #0f172a;
  border-radius: 50%;
}
</style>
