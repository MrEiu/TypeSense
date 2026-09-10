<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { QuestionItemModel } from '../../../schema/questionnaire-schema-types';

const props = defineProps<{
  data: {
    question: QuestionItemModel;
    seqNumber: number;
  };
  targetPosition?: Position;
  sourcePosition?: Position;
}>();

const q = computed(() => props.data.question);

function getTypeLabel(type: string): string {
  switch (type) {
    case 'single_choice':
      return '单选题';
    case 'multiple_choice':
      return '多选题';
    case 'likert_scale':
      return '量表评分';
    case 'text_input':
      return '问答输入';
    default:
      return type;
  }
}
</script>

<template>
  <div class="canvas-node question-node">
    <Handle type="target" :position="targetPosition || Position.Left" class="flow-handle handle-target" />

    <div class="node-header">
      <div class="header-left">
        <span class="node-seq">Q{{ data.seqNumber }}</span>
        <span class="type-pill">{{ getTypeLabel(q.type) }}</span>
        <span v-if="q.required" class="required-star">*必填</span>
      </div>
      <div v-if="q.jump" class="branch-indicator" title="配置了分支流控跳转">
        <span>⚡ 分支</span>
      </div>
    </div>

    <div class="node-title">{{ q.title }}</div>

    <!-- 李克特矩阵量表预览 -->
    <div v-if="q.type === 'likert_scale' && q.statements && q.statements.length > 0" class="options-preview">
      <div class="matrix-summary-pill">
        📋 {{ q.statements.length }} 个评测条目 · {{ (q.options || []).length }} 阶刻度
      </div>
      <div
        v-for="(stmt, idx) in q.statements.slice(0, 3)"
        :key="idx"
        class="opt-item"
      >
        <span class="opt-bullet">◈</span>
        <span class="opt-text">{{ typeof stmt === 'string' ? stmt : stmt.label }}</span>
      </div>
      <div v-if="q.statements.length > 3" class="opt-more">
        + 其余 {{ q.statements.length - 3 }} 个条目...
      </div>
    </div>

    <!-- 选项预览列表 (选择题 / 单行打分) -->
    <div v-else-if="q.options && q.options.length > 0" class="options-preview">
      <div
        v-for="(opt, idx) in q.options.slice(0, 3)"
        :key="idx"
        class="opt-item"
      >
        <span class="opt-bullet">○</span>
        <span class="opt-text">{{ typeof opt === 'string' ? opt : opt.label }}</span>
      </div>
      <div v-if="q.options.length > 3" class="opt-more">
        + 其余 {{ q.options.length - 3 }} 项...
      </div>
    </div>

    <!-- 问答占位预览 -->
    <div v-else-if="q.placeholder" class="placeholder-preview">
      {{ q.placeholder }}
    </div>

    <!-- 衍生变量与流控标签 -->
    <div v-if="q.set" class="variables-tag-bar">
      <span v-for="(expr, vName) in q.set" :key="vName" class="var-badge">
        fx: {{ vName }} = {{ expr }}
      </span>
    </div>

    <Handle type="source" :position="sourcePosition || Position.Right" class="flow-handle handle-source" />
  </div>
</template>

<style scoped>
.canvas-node {
  width: 400px;
  background: rgba(15, 23, 42, 0.9);
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 16px 18px;
  color: #f8fafc;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  position: relative;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.canvas-node:hover {
  border-color: rgba(99, 102, 241, 0.7);
  box-shadow: 0 14px 40px rgba(99, 102, 241, 0.2);
  transform: translateY(-2px);
}

.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-seq {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  font-weight: 800;
  color: #818cf8;
}

.type-pill {
  font-size: 0.72rem;
  padding: 2px 7px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: #cbd5e1;
}

.required-star {
  font-size: 0.7rem;
  color: #f43f5e;
}

.branch-indicator {
  font-size: 0.72rem;
  font-weight: 700;
  color: #c084fc;
  background: rgba(192, 132, 252, 0.15);
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid rgba(192, 132, 252, 0.3);
}

.node-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f1f5f9;
  line-height: 1.45;
  margin-bottom: 12px;
}

.options-preview {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 8px;
}

.matrix-summary-pill {
  font-size: 0.72rem;
  font-weight: 600;
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
  border: 1px solid rgba(52, 211, 153, 0.25);
  padding: 3px 8px;
  border-radius: 6px;
  margin-bottom: 4px;
}

.opt-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.02);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.opt-bullet {
  font-size: 0.75rem;
  color: #64748b;
}

.opt-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opt-more {
  font-size: 0.72rem;
  color: #64748b;
  font-style: italic;
  padding-left: 6px;
}

.placeholder-preview {
  font-size: 0.8rem;
  color: #64748b;
  font-style: italic;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  margin-bottom: 8px;
}

.variables-tag-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.var-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  padding: 2px 6px;
  border-radius: 4px;
}

.flow-handle {
  width: 10px;
  height: 10px;
  background: #818cf8;
  border: 2px solid #0f172a;
  border-radius: 50%;
}
</style>
