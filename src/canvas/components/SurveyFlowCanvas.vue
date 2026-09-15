<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import type { Node, Edge } from '@vue-flow/core';

import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

import type { QuestionnaireModel } from '../../schema/questionnaire-schema-types';
import {
  QuestionnaireGraphTransformer,
  type PendingBlockInfo,
} from '../services/questionnaire-graph-transformer';
import { layoutGraph } from '../services/dagre-layout';

import StartNode from './nodes/StartNode.vue';
import QuestionNode from './nodes/QuestionNode.vue';
import SkeletonBlockNode from './nodes/SkeletonBlockNode.vue';
import EndNode from './nodes/EndNode.vue';

const props = withDefaults(
  defineProps<{
    questionnaire: QuestionnaireModel;
    pendingBlocks?: PendingBlockInfo[];
    initialDirection?: 'LR' | 'TB';
  }>(),
  {
    initialDirection: 'LR',
  }
);

const emit = defineEmits<{
  (e: 'select-question', id: string): void;
}>();

const { fitView, zoomIn, zoomOut, getZoom } = useVueFlow();

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);
const currentDirection = ref<'LR' | 'TB'>(props.initialDirection);
const currentZoomPill = ref('100%');

function updateZoomIndicator() {
  const z = getZoom();
  currentZoomPill.value = `${Math.round(z * 100)}%`;
}

/**
 * 重新计算拓扑并自适应排版
 */
async function recomputeLayout(direction = currentDirection.value) {
  if (!props.questionnaire) return;

  const rawGraph = QuestionnaireGraphTransformer.transformToFlowGraph(
    props.questionnaire,
    props.pendingBlocks
  );

  const layouted = layoutGraph(rawGraph.nodes, rawGraph.edges, { direction });

  nodes.value = layouted.nodes;
  edges.value = layouted.edges;

  await nextTick();
  setTimeout(() => {
    fitView({ padding: 0.18, duration: 300 });
    updateZoomIndicator();
  }, 50);
}

function handleToggleDirection() {
  currentDirection.value = currentDirection.value === 'LR' ? 'TB' : 'LR';
  recomputeLayout(currentDirection.value);
}

function handleFitView() {
  fitView({ padding: 0.18, duration: 400 });
  setTimeout(updateZoomIndicator, 420);
}

function handleZoomIn() {
  zoomIn({ duration: 250 });
  setTimeout(updateZoomIndicator, 270);
}

function handleZoomOut() {
  zoomOut({ duration: 250 });
  setTimeout(updateZoomIndicator, 270);
}

// 监听数据变化，动态重新计算排版
watch(
  () => [props.questionnaire, props.pendingBlocks],
  () => {
    recomputeLayout();
  },
  { deep: true }
);

onMounted(() => {
  recomputeLayout();
});
</script>

<template>
  <div class="survey-flow-viewport">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-zoom="0.75"
      :min-zoom="0.1"
      :max-zoom="2.5"
      :fit-view-on-init="true"
      @pane-scroll="updateZoomIndicator"
      @node-click="(e) => emit('select-question', e.node.id)"
    >
      <Background :gap="24" :size="1.2" pattern-color="rgba(255, 255, 255, 0.08)" />

      <!-- 自定义节点插槽 -->
      <template #node-start="nodeProps">
        <StartNode v-bind="nodeProps" />
      </template>

      <template #node-question="nodeProps">
        <QuestionNode v-bind="nodeProps" />
      </template>

      <template #node-skeleton="nodeProps">
        <SkeletonBlockNode v-bind="nodeProps" />
      </template>

      <template #node-end="nodeProps">
        <EndNode v-bind="nodeProps" />
      </template>
    </VueFlow>

    <!-- 悬浮控制工具栏 -->
    <div class="flow-floating-toolbar">
      <button type="button" class="tool-btn" title="缩小" @click="handleZoomOut">−</button>
      <span class="zoom-pill">{{ currentZoomPill }}</span>
      <button type="button" class="tool-btn" title="放大" @click="handleZoomIn">+</button>

      <button type="button" class="tool-btn fit-btn" title="全景居中" @click="handleFitView">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        <span>居中</span>
      </button>

      <button type="button" class="tool-btn dir-btn" title="切换排版方向" @click="handleToggleDirection">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"></polyline>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <polyline points="7 23 3 19 7 15"></polyline>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
        <span>{{ currentDirection === 'LR' ? '水平流向' : '垂直流向' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.survey-flow-viewport {
  width: 100%;
  height: 100%;
  position: relative;
  background: #060911;
  overflow: hidden;
}

/* 悬浮控制工具栏 */
.flow-floating-toolbar {
  position: absolute;
  right: 24px;
  bottom: 24px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(16px);
}

.tool-btn {
  height: 32px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
  color: #fff;
}

.zoom-pill {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  color: #94a3b8;
  padding: 0 4px;
  min-width: 44px;
  text-align: center;
}
</style>
