/**
 * questionnaire-graph-transformer.ts
 *
 * 问卷领域模型至 Vue Flow 拓扑图数据结构转换器
 * 职责：遍历题目、跳转规则与待生成组块，输出包含完整元数据的 Node[] 与 Edge[]
 */

import type { Node, Edge } from '@vue-flow/core';
import { MarkerType } from '@vue-flow/core';
import type { QuestionnaireModel } from '../../schema/questionnaire-schema-types';

export interface PendingBlockInfo {
  id: string;
  name: string;
  questionCount: number;
  description?: string;
}

export interface FlowGraphData {
  nodes: Node[];
  edges: Edge[];
}

export class QuestionnaireGraphTransformer {
  /**
   * 将问卷领域模型转换为 Vue Flow 标准 Node 与 Edge 数组
   */
  public static transformToFlowGraph(
    questionnaire: QuestionnaireModel,
    pendingBlocks?: PendingBlockInfo[]
  ): FlowGraphData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodeIds = new Set<string>();

    const startNodeId = 'node_start';
    const endNodeId = 'node_end';

    // 1. 启动节点
    nodes.push({
      id: startNodeId,
      type: 'start',
      position: { x: 0, y: 0 },
      data: {
        title: questionnaire.title || '问卷启动入口',
        description: questionnaire.description || '受访者接入引导终端',
      },
    });
    nodeIds.add(startNodeId);

    // 2. 已就绪题目节点
    const questions = questionnaire.questions || [];
    questions.forEach((q, index) => {
      const nodeId = `node_q_${q.id}`;
      nodes.push({
        id: nodeId,
        type: 'question',
        position: { x: 0, y: 0 },
        data: {
          question: q,
          seqNumber: index + 1,
        },
      });
      nodeIds.add(nodeId);
    });

    // 3. 待生成组块骨架节点 (AI 规划分面)
    const blocks = pendingBlocks || [];
    blocks.forEach((b) => {
      const blockNodeId = `node_block_${b.id}`;
      nodes.push({
        id: blockNodeId,
        type: 'skeleton',
        position: { x: 0, y: 0 },
        data: {
          block: b,
        },
      });
      nodeIds.add(blockNodeId);
    });

    // 4. 结束收束节点
    nodes.push({
      id: endNodeId,
      type: 'end',
      position: { x: 0, y: 0 },
      data: {
        title: '问卷完成收束',
        description: '作答数据落地与流控交付终端',
      },
    });
    nodeIds.add(endNodeId);

    // 5. 拓扑流向边 (Edges)
    const addEdge = (source: string, target: string, label?: string, isBranch = false) => {
      if (!nodeIds.has(source) || !nodeIds.has(target)) return;
      const edgeId = `edge_${source}_to_${target}_${edges.length}`;
      edges.push({
        id: edgeId,
        source,
        target,
        label,
        type: 'default', // 贝塞尔曲线
        animated: isBranch,
        markerEnd: MarkerType.ArrowClosed,
        style: {
          stroke: isBranch ? '#a855f7' : '#6366f1',
          strokeWidth: 2,
        },
        labelStyle: {
          fill: '#cbd5e1',
          fontWeight: 600,
          fontSize: '11px',
        },
        labelBgStyle: {
          fill: '#0f172a',
          fillOpacity: 0.85,
        },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      });
    };

    if (questions.length === 0) {
      if (blocks.length > 0) {
        addEdge(startNodeId, `node_block_${blocks[0].id}`, '启动蓝图');
        for (let i = 0; i < blocks.length - 1; i++) {
          addEdge(`node_block_${blocks[i].id}`, `node_block_${blocks[i + 1].id}`, '推进组块');
        }
        addEdge(`node_block_${blocks[blocks.length - 1].id}`, endNodeId, '完成收束');
      } else {
        addEdge(startNodeId, endNodeId, '就绪');
      }
    } else {
      // 启动节点连接首题
      addEdge(startNodeId, `node_q_${questions[0].id}`, '启动问卷');

      // 题目节点连线
      questions.forEach((q, index) => {
        const srcId = `node_q_${q.id}`;
        const isLastQuestion = index === questions.length - 1;

        if (Array.isArray(q.jump) && q.jump.length > 0) {
          q.jump.forEach((rule) => {
            const targetNodeId =
              rule.to === 'end' || rule.to === 'exit'
                ? endNodeId
                : `node_q_${rule.to}`;
            const label = rule.when ? Object.entries(rule.when).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(' & ') : '默认';
            addEdge(srcId, targetNodeId, label, true);
          });
        } else if (typeof q.jump === 'string' && q.jump.trim() !== '') {
          const target = q.jump.trim();
          const targetNodeId = target === 'end' || target === 'exit' ? endNodeId : `node_q_${target}`;
          addEdge(srcId, targetNodeId, '跳转', true);
        } else {
          if (!isLastQuestion) {
            const nextQ = questions[index + 1];
            addEdge(srcId, `node_q_${nextQ.id}`, '推进');
          } else {
            if (blocks.length > 0) {
              addEdge(srcId, `node_block_${blocks[0].id}`, '下一组块');
            } else {
              addEdge(srcId, endNodeId, '完成');
            }
          }
        }
      });

      // 待生成组块间连线
      if (blocks.length > 0) {
        for (let i = 0; i < blocks.length - 1; i++) {
          addEdge(`node_block_${blocks[i].id}`, `node_block_${blocks[i + 1].id}`, '推进组块');
        }
        addEdge(`node_block_${blocks[blocks.length - 1].id}`, endNodeId, '完成收束');
      }
    }

    return { nodes, edges };
  }
}
