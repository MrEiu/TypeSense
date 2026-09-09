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

export type CanvasNodeType = 'start_node' | 'question_node' | 'logic_node' | 'end_node' | 'block_skeleton_node';

export interface PendingBlockInfo {
  id: string;
  name: string;
  questionCount: number;
  description?: string;
}

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
   * 将问卷领域模型转换为包含题目、逻辑原语或待生成组块的有向拓扑图
   */
  public static transformToGraph(
    questionnaire: QuestionnaireModel,
    pendingBlocks?: PendingBlockInfo[]
  ): CanvasGraphModel {
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

    // 2. 转换所有已就绪题目节点
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

    // 3. 待生成组块骨架节点 (AI 蓝图规划动态呈现)
    const blocks = pendingBlocks || [];
    blocks.forEach((b) => {
      const blockNodeId = `canvas_node_block_${b.id}`;
      nodes.push({
        id: blockNodeId,
        type: 'block_skeleton_node',
        title: `【待生成组块】${b.name}`,
        subtitle: `计划 ${b.questionCount} 题 · ${b.description || 'AI 规划调研分面'}`,
        width: 440,
        height: 180,
      });
      nodeIds.add(blockNodeId);
    });

    // 4. 结束收束节点
    nodes.push({
      id: endNodeId,
      type: 'end_node',
      title: '问卷完成收束',
      subtitle: '作答结果汇聚与数据交付终端',
      width: 420,
      height: 200,
    });
    nodeIds.add(endNodeId);

    // 5. 拓扑流向连线 (Edges)
    if (questions.length === 0) {
      if (blocks.length > 0) {
        this.safeAddEdge(edges, nodeIds, startNodeId, `canvas_node_block_${blocks[0].id}`, '启动蓝图');
        for (let i = 0; i < blocks.length - 1; i++) {
          this.safeAddEdge(
            edges,
            nodeIds,
            `canvas_node_block_${blocks[i].id}`,
            `canvas_node_block_${blocks[i + 1].id}`,
            '推进组块'
          );
        }
        this.safeAddEdge(edges, nodeIds, `canvas_node_block_${blocks[blocks.length - 1].id}`, endNodeId, '完成收束');
      } else {
        this.safeAddEdge(edges, nodeIds, startNodeId, endNodeId, '就绪');
      }
    } else {
      // 有已生成题目
      this.safeAddEdge(edges, nodeIds, startNodeId, `canvas_node_${questions[0].id}`, '启动问卷');

      // 题目内部连线
      questions.forEach((q, index) => {
        const srcId = `canvas_node_${q.id}`;
        const isLastQuestion = index === questions.length - 1;

        if (Array.isArray(q.jump) && q.jump.length > 0) {
          q.jump.forEach((rule) => {
            const targetNodeId =
              rule.to === 'end' || rule.to === 'exit'
                ? endNodeId
                : `canvas_node_${rule.to}`;
            const label = rule.when ? Object.entries(rule.when).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(' & ') : '默认';
            this.safeAddEdge(edges, nodeIds, srcId, targetNodeId, label);
          });
        } else if (typeof q.jump === 'string' && q.jump.trim() !== '') {
          const target = q.jump.trim();
          const targetNodeId = target === 'end' || target === 'exit' ? endNodeId : `canvas_node_${target}`;
          this.safeAddEdge(edges, nodeIds, srcId, targetNodeId, '跳转');
        } else {
          if (!isLastQuestion) {
            const nextQ = questions[index + 1];
            this.safeAddEdge(edges, nodeIds, srcId, `canvas_node_${nextQ.id}`, '推进');
          } else {
            // 最后一题：如果还有后续待生成组块，连向第一块待生成组块
            if (blocks.length > 0) {
              this.safeAddEdge(edges, nodeIds, srcId, `canvas_node_block_${blocks[0].id}`, '下一组块');
            } else {
              this.safeAddEdge(edges, nodeIds, srcId, endNodeId, '完成');
            }
          }
        }
      });

      // 待生成组块之间的串联连线
      if (blocks.length > 0) {
        for (let i = 0; i < blocks.length - 1; i++) {
          this.safeAddEdge(
            edges,
            nodeIds,
            `canvas_node_block_${blocks[i].id}`,
            `canvas_node_block_${blocks[i + 1].id}`,
            '推进组块'
          );
        }
        this.safeAddEdge(edges, nodeIds, `canvas_node_block_${blocks[blocks.length - 1].id}`, endNodeId, '完成收束');
      }
    }

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
