/**
 * questionnaire-graph-transformer.ts
 *
 * 问卷拓扑图转换服务
 * 职责：
 * 1. 将无坐标的 JSON 问卷数据转换为抽象有向图 (Nodes & Edges)；
 * 2. 真实呈现题目节点与逻辑原语节点构成的分支、汇合、循环与终止等复杂 DAG 拓扑；
 * 3. 动态估算节点长宽尺寸，为 ELK 布局引擎提供精确的排版基准。
 */

import type { QuestionnaireModel, QuestionItemModel } from '../../schema/questionnaire-schema-types';

export type CanvasNodeType = 'start_node' | 'question_node' | 'logic_node' | 'end_node';

export interface CanvasNodeDescriptor {
  id: string;
  type: CanvasNodeType;
  seqNumber?: number;
  questionModel?: QuestionItemModel;
  logicType?: string;
  logicDescription?: string;
  title: string;
  subtitle?: string;
  width: number;
  height: number;
}

export interface CanvasEdgeDescriptor {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface CanvasGraphModel {
  id: string;
  title: string;
  nodes: CanvasNodeDescriptor[];
  edges: CanvasEdgeDescriptor[];
}

export class QuestionnaireGraphTransformer {
  /**
   * 将问卷领域模型转换为包含题目与逻辑原语的有向拓扑图
   */
  public static transformToGraph(questionnaire: QuestionnaireModel): CanvasGraphModel {
    const nodes: CanvasNodeDescriptor[] = [];
    const edges: CanvasEdgeDescriptor[] = [];
    const nodeIds = new Set<string>();

    const startNodeId = 'canvas_node_start';
    const endNodeId = 'canvas_node_end';

    // 1. 起始引导节点
    nodes.push({
      id: startNodeId,
      type: 'start_node',
      title: questionnaire.title,
      subtitle: questionnaire.description || '问卷起始引导与元数据',
      width: 440,
      height: 220,
    });
    nodeIds.add(startNodeId);

    // 2. 转换所有题目节点
    const questions = questionnaire.questions || [];
    questions.forEach((q, index) => {
      const nodeId = `canvas_node_${q.id}`;
      const estimatedHeight = this.estimateCardHeight(q);

      nodes.push({
        id: nodeId,
        type: 'question_node',
        seqNumber: index + 1,
        questionModel: q,
        title: q.title,
        subtitle: q.description,
        width: 460,
        height: estimatedHeight,
      });
      nodeIds.add(nodeId);
    });

    // 3. 结束收束节点
    nodes.push({
      id: endNodeId,
      type: 'end_node',
      title: '问卷完成收束',
      subtitle: '作答结果汇聚与数据交付终端',
      width: 420,
      height: 200,
    });
    nodeIds.add(endNodeId);

    // 4. 连接拓扑连线 (Edges)
    const firstTargetId = questions[0]?.id ? questions[0].id : '';
    if (firstTargetId) {
      this.safeAddEdge(edges, nodeIds, startNodeId, `canvas_node_${firstTargetId}`, '启动问卷');
    }

    // 题目连线：支持关键节点 jump (规则列表或直跳字符串) 与默认自然题号推进
    questions.forEach((q, index) => {
      const srcId = `canvas_node_${q.id}`;

      // 1. 如果配置了 jump 规则列表
      if (Array.isArray(q.jump) && q.jump.length > 0) {
        q.jump.forEach((rule) => {
          const targetNodeId =
            rule.to === 'end' || rule.to === 'exit'
              ? endNodeId
              : `canvas_node_${rule.to}`;
          const label = rule.when ? Object.entries(rule.when).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(' & ') : '默认';
          this.safeAddEdge(edges, nodeIds, srcId, targetNodeId, label);
        });
      }
      // 2. 如果配置了纯字符串直跳
      else if (typeof q.jump === 'string' && q.jump.trim() !== '') {
        const target = q.jump.trim();
        const targetNodeId = target === 'end' || target === 'exit' ? endNodeId : `canvas_node_${target}`;
        this.safeAddEdge(edges, nodeIds, srcId, targetNodeId, '跳转');
      }
      // 3. 默认自然题号推进到下一题或完成
      else {
        if (index < questions.length - 1) {
          const nextQ = questions[index + 1];
          this.safeAddEdge(edges, nodeIds, srcId, `canvas_node_${nextQ.id}`, '推进');
        } else {
          this.safeAddEdge(edges, nodeIds, srcId, endNodeId, '完成');
        }
      }
    });

    return {
      id: questionnaire.id,
      title: questionnaire.title,
      nodes,
      edges,
    };
  }

  private static safeAddEdge(
    edges: CanvasEdgeDescriptor[],
    validNodes: Set<string>,
    source: string,
    target: string,
    label?: string
  ): void {
    if (validNodes.has(source) && validNodes.has(target)) {
      edges.push({
        id: `edge_${source}_to_${target}_${edges.length}`,
        source,
        target,
        label,
      });
    }
  }

  private static estimateCardHeight(q: QuestionItemModel): number {
    const basePadding = 120;
    switch (q.type) {
      case 'single_choice':
      case 'multiple_choice': {
        const optionCount = q.options?.length || 3;
        return basePadding + optionCount * 68 + 40;
      }
      case 'text_input':
        return 220;
      case 'likert_scale':
        return 280;
      default:
        return 260;
    }
  }
}
