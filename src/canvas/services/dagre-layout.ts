/**
 * dagre-layout.ts
 *
 * 基于 @dagrejs/dagre 的纯前端快速有向无环图 (DAG) 拓扑排版算法
 * 职责：纯数学计算，根据节点尺寸与边的指向关系推导每个节点的 position: { x, y }
 */

import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@vue-flow/core';
import { Position } from '@vue-flow/core';

export interface LayoutOptions {
  direction?: 'LR' | 'TB';
  nodeWidth?: number;
  nodeHeight?: number;
  ranksep?: number;
  nodesep?: number;
}

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const direction = options.direction || 'LR';
  const isHorizontal = direction === 'LR';

  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: options.ranksep || (isHorizontal ? 130 : 90),
    nodesep: options.nodesep || (isHorizontal ? 70 : 80),
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    const nodeDim = (node as any).dimensions;
    let w = nodeDim?.width || 420;
    let h = nodeDim?.height || 220;

    if (node.type === 'start') {
      w = 360;
      h = 130;
    } else if (node.type === 'end') {
      w = 360;
      h = 140;
    } else if (node.type === 'skeleton') {
      w = 420;
      h = 170;
    }

    dagreGraph.setNode(node.id, { width: w, height: h });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const nodeDim = (node as any).dimensions;
    let w = nodeDim?.width || 420;
    let h = nodeDim?.height || 220;
    if (node.type === 'start') {
      w = 360;
      h = 130;
    } else if (node.type === 'end') {
      w = 360;
      h = 140;
    } else if (node.type === 'skeleton') {
      w = 420;
      h = 170;
    }

    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition ? nodeWithPosition.x - w / 2 : 0,
        y: nodeWithPosition ? nodeWithPosition.y - h / 2 : 0,
      },
    };
  });

  return { nodes: layoutedNodes as Node[], edges };
}
