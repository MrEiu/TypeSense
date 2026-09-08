/**
 * canvas-layout-engine.ts
 *
 * 基于 ELK (Eclipse Layout Kernel) 的自组织分层排版引擎
 * 职责：运行 Sugiyama 拓扑分层图算法，自动推导无坐标节点的 x, y, width, height 与边曲线控制点。
 * 契约：纯算法计算，不涉及 DOM 操作，输出纯几何布局数据。
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
  private elkInstance: InstanceType<typeof ELK>;

  constructor() {
    this.elkInstance = new ELK();
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

    // 构造 ELK 接收的图节点与边数据
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

    // 调用 ELK 自组织算法计算几何拓扑
    const rawResult = await this.elkInstance.layout(elkGraph);
    const layoutResult = rawResult as ElkNode;

    const nodeDescriptorMap = new Map<string, CanvasNodeDescriptor>();
    graph.nodes.forEach((n) => nodeDescriptorMap.set(n.id, n));

    const edgeDescriptorMap = new Map<string, string | undefined>();
    graph.edges.forEach((e) => edgeDescriptorMap.set(e.id, e.label));

    // 映射排版后的节点
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

    // 映射排版后的边与贝塞尔控制点
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
  }
}
