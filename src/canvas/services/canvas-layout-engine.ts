/**
 * canvas-layout-engine.ts
 *
 * 基于 ELK 与自组织拓扑分层的双模排版引擎
 * 职责：运行 Sugiyama 拓扑分层图算法，自动推导无坐标节点的 x, y, width, height 与边曲线控制点。
 * 契约：纯算法计算，不涉及 DOM 操作，输出纯几何布局数据。在 Web Worker 不可用或 ELK 异常时具备拓扑降级自愈能力，绝不让画布白屏崩溃。
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkExtendedEdge } from 'elkjs';
import type { CanvasGraphModel, CanvasNodeDescriptor } from './questionnaire-graph-transformer';

export interface LayoutedNodeItem extends CanvasNodeDescriptor {
  x: number;
  y: number;
  actualWidth: number;
  actualHeight: number;
}

export interface LayoutedEdgeSectionPoint {
  x: number;
  y: number;
}

export interface LayoutedEdgeItem {
  id: string;
  source: string;
  target: string;
  label?: string;
  startPoint: LayoutedEdgeSectionPoint;
  endPoint: LayoutedEdgeSectionPoint;
  bendPoints?: LayoutedEdgeSectionPoint[];
}

export interface LayoutedCanvasGraph {
  id: string;
  totalWidth: number;
  totalHeight: number;
  nodes: LayoutedNodeItem[];
  edges: LayoutedEdgeItem[];
}

export interface CanvasLayoutEngineOptions {
  direction?: 'RIGHT' | 'DOWN';
  nodeSpacing?: number;
  layerSpacing?: number;
}

export class CanvasLayoutEngine {
  private elkInstance: InstanceType<typeof ELK> | null = null;

  constructor() {
    this.initElk();
  }

  private initElk(): void {
    try {
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        this.elkInstance = new ELK({
          workerFactory: () => {
            return new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url), { type: 'classic' });
          },
        });
      } else {
        this.elkInstance = new ELK();
      }
    } catch (err) {
      console.warn('[CanvasLayoutEngine] 初始化 ELK Web Worker 异常，将自动启用拓扑自愈引擎:', err);
      this.elkInstance = null;
    }
  }

  /**
   * 运行自组织排版算法，生成带几何坐标的图结构
   */
  public async computeLayout(
    graph: CanvasGraphModel,
    options: CanvasLayoutEngineOptions = {}
  ): Promise<LayoutedCanvasGraph> {
    const layoutDirection = options.direction || 'RIGHT';
    const nodeSpacing = options.nodeSpacing || 90;
    const layerSpacing = options.layerSpacing || 140;

    // 优先尝试 ELK 工业级分层排版
    if (this.elkInstance) {
      try {
        const elkGraph: ElkNode = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': layoutDirection,
            'elk.spacing.nodeNode': String(nodeSpacing),
            'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
            'elk.edgeRouting': 'SPLINES',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
          },
          children: graph.nodes.map((n) => ({
            id: n.id,
            width: n.width,
            height: n.height,
          })),
          edges: graph.edges.map((e) => ({
            id: e.id,
            sources: [e.source],
            targets: [e.target],
          })),
        };

        const rawResult = await this.elkInstance.layout(elkGraph);
        const layoutResult = rawResult as ElkNode;

        const nodeDescriptorMap = new Map<string, CanvasNodeDescriptor>();
        graph.nodes.forEach((n) => nodeDescriptorMap.set(n.id, n));

        const edgeDescriptorMap = new Map<string, string | undefined>();
        graph.edges.forEach((e) => edgeDescriptorMap.set(e.id, e.label));

        const layoutedNodes: LayoutedNodeItem[] = (layoutResult.children || []).map((child) => {
          const original = nodeDescriptorMap.get(child.id);
          if (!original) {
            throw new Error(`找不到原始节点信息: ${child.id}`);
          }
          return {
            ...original,
            x: child.x || 0,
            y: child.y || 0,
            actualWidth: child.width || original.width,
            actualHeight: child.height || original.height,
          };
        });

        const layoutedEdges: LayoutedEdgeItem[] = ((layoutResult.edges as ElkExtendedEdge[] | undefined) || []).map((edge) => {
          const section = edge.sections?.[0];
          const startPoint = section?.startPoint || { x: 0, y: 0 };
          const endPoint = section?.endPoint || { x: 0, y: 0 };
          const bendPoints = section?.bendPoints || [];

          return {
            id: edge.id,
            source: edge.sources[0],
            target: edge.targets[0],
            label: edgeDescriptorMap.get(edge.id),
            startPoint,
            endPoint,
            bendPoints,
          };
        });

        return {
          id: graph.id,
          totalWidth: layoutResult.width || 2000,
          totalHeight: layoutResult.height || 1200,
          nodes: layoutedNodes,
          edges: layoutedEdges,
        };
      } catch (elkErr) {
        console.warn('[CanvasLayoutEngine] ELK 计算拓扑失败，无缝切入拓扑自愈引擎:', elkErr);
      }
    }

    // 确定性拓扑自愈排版引擎（保证 100% 极速可用，绝不崩溃）
    return this.computeDeterministicTopologicalLayout(graph, options);
  }

  /**
   * 确定性拓扑分层排版自愈引擎 (Fallback Sugiyama DAG Layout)
   * 依据入度与有向图层次关系将问卷节点依次分层排布，并推导平滑贝塞尔曲线端点
   */
  private computeDeterministicTopologicalLayout(
    graph: CanvasGraphModel,
    options: CanvasLayoutEngineOptions
  ): LayoutedCanvasGraph {
    const direction = options.direction || 'RIGHT';
    const nodeSpacing = options.nodeSpacing || 90;
    const layerSpacing = options.layerSpacing || 160;

    // 1. 构建邻接表与入度表
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    graph.nodes.forEach((n) => {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    });
    graph.edges.forEach((e) => {
      adj.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });

    // 2. 按拓扑层级（BFS 分层）归类节点
    const layers: CanvasNodeDescriptor[][] = [];
    const visited = new Set<string>();

    // 根节点（起始引导节点）
    let currentLevel = graph.nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);
    if (currentLevel.length === 0 && graph.nodes.length > 0) {
      currentLevel = [graph.nodes[0]];
    }

    while (currentLevel.length > 0) {
      const nextLevel: CanvasNodeDescriptor[] = [];
      const thisLayerNodes: CanvasNodeDescriptor[] = [];

      for (const node of currentLevel) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        thisLayerNodes.push(node);

        for (const targetId of adj.get(node.id) || []) {
          const targetNode = graph.nodes.find((n) => n.id === targetId);
          if (targetNode && !visited.has(targetId)) {
            nextLevel.push(targetNode);
          }
        }
      }

      if (thisLayerNodes.length > 0) {
        layers.push(thisLayerNodes);
      }

      // 孤岛节点容错排入后续层级
      if (nextLevel.length === 0 && visited.size < graph.nodes.length) {
        const remaining = graph.nodes.find((n) => !visited.has(n.id));
        if (remaining) nextLevel.push(remaining);
      }

      currentLevel = nextLevel;
    }

    // 3. 计算坐标矩阵
    const layoutedNodes: LayoutedNodeItem[] = [];
    const nodePosMap = new Map<string, { x: number; y: number; width: number; height: number }>();

    let currentMainOffset = 40;
    let maxCrossOverall = 0;

    layers.forEach((layerNodes) => {
      let maxMainInLayer = 0;
      let currentCrossOffset = 40;

      layerNodes.forEach((node) => {
        let x = 0;
        let y = 0;

        if (direction === 'RIGHT') {
          x = currentMainOffset;
          y = currentCrossOffset;
          currentCrossOffset += node.height + nodeSpacing;
          maxMainInLayer = Math.max(maxMainInLayer, node.width);
        } else {
          x = currentCrossOffset;
          y = currentMainOffset;
          currentCrossOffset += node.width + nodeSpacing;
          maxMainInLayer = Math.max(maxMainInLayer, node.height);
        }

        layoutedNodes.push({
          ...node,
          x,
          y,
          actualWidth: node.width,
          actualHeight: node.height,
        });

        nodePosMap.set(node.id, { x, y, width: node.width, height: node.height });
      });

      maxCrossOverall = Math.max(maxCrossOverall, currentCrossOffset);
      currentMainOffset += maxMainInLayer + layerSpacing;
    });

    // 4. 计算边平滑连接坐标
    const edgeDescriptorMap = new Map<string, string | undefined>();
    graph.edges.forEach((e) => edgeDescriptorMap.set(e.id, e.label));

    const layoutedEdges: LayoutedEdgeItem[] = graph.edges.map((edge) => {
      const src = nodePosMap.get(edge.source) || { x: 0, y: 0, width: 440, height: 200 };
      const tgt = nodePosMap.get(edge.target) || { x: 0, y: 0, width: 440, height: 200 };

      const startPoint =
        direction === 'RIGHT'
          ? { x: src.x + src.width, y: src.y + src.height / 2 }
          : { x: src.x + src.width / 2, y: src.y + src.height };

      const endPoint =
        direction === 'RIGHT'
          ? { x: tgt.x, y: tgt.y + tgt.height / 2 }
          : { x: tgt.x + tgt.width / 2, y: tgt.y };

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edgeDescriptorMap.get(edge.id),
        startPoint,
        endPoint,
      };
    });

    const totalWidth = direction === 'RIGHT' ? currentMainOffset + 200 : maxCrossOverall + 200;
    const totalHeight = direction === 'RIGHT' ? maxCrossOverall + 200 : currentMainOffset + 200;

    return {
      id: graph.id,
      totalWidth: Math.max(2000, totalWidth),
      totalHeight: Math.max(1200, totalHeight),
      nodes: layoutedNodes,
      edges: layoutedEdges,
    };
  }
}
