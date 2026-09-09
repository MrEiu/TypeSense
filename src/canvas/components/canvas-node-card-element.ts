/**
 * canvas-node-card-element.ts
 *
 * 无限幕布节点卡片组件
 * 职责：依据自组织排版坐标渲染卡片，通过插件注册中心动态装配对应题型组件。
 * 契约：所有文本与题目配置完全从 LayoutedNodeItem 动态读取，严禁硬编码。
 */

import type { LayoutedNodeItem } from '../services/canvas-layout-engine';
import { getQuestionPlugin } from '../../questions/registry';

export function renderCanvasNodeCardElement(node: LayoutedNodeItem): HTMLElement {
  const card = document.createElement('div');
  card.className = `canvas-node-card node-type-${node.type}`;
  card.id = `canvas-node-${node.id}`;
  card.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
  card.style.width = `${node.actualWidth}px`;

  // 卡片连接锚点（左右锚点）
  const inputPort = document.createElement('div');
  inputPort.className = 'canvas-node-port port-input';
  const outputPort = document.createElement('div');
  outputPort.className = 'canvas-node-port port-output';
  card.appendChild(inputPort);
  card.appendChild(outputPort);

  // 卡片头部
  const header = document.createElement('div');
  header.className = 'canvas-node-header';

  const badge = document.createElement('div');
  badge.className = 'canvas-node-badge';

  if (node.type === 'start_node') {
    badge.textContent = '🚀 问卷起始';
    badge.classList.add('badge-start');
  } else if (node.type === 'end_node') {
    badge.textContent = '🏁 完成收束';
    badge.classList.add('badge-end');
  } else if (node.type === 'logic_node') {
    badge.textContent = `⚡ 流程控制 · ${node.logicType?.toUpperCase() || 'LOGIC'}`;
    badge.classList.add('badge-logic');
  } else if (node.type === 'block_skeleton_node') {
    badge.textContent = '✨ 待生成组块';
    badge.classList.add('badge-skeleton');
  } else {
    badge.textContent = `Q${node.seqNumber || 0} · ${getQuestionTypeLabel(node.questionModel?.type)}`;
  }

  const title = document.createElement('h3');
  title.className = 'canvas-node-title';
  title.textContent = node.title;

  header.appendChild(badge);
  header.appendChild(title);

  if (node.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'canvas-node-subtitle';
    subtitle.textContent = node.subtitle;
    header.appendChild(subtitle);
  }

  card.appendChild(header);

  // 卡片主体内容区
  const body = document.createElement('div');
  body.className = 'canvas-node-body';

  if (node.type === 'start_node') {
    body.innerHTML = `
      <div class="canvas-node-meta-box">
        <div>⚡ 模式：自组织分层拓扑 (ELK)</div>
        <div>📐 坐标：动态算法推导计算</div>
      </div>
    `;
  } else if (node.type === 'block_skeleton_node') {
    body.innerHTML = `
      <div class="skeleton-placeholder-box">
        <div class="skeleton-pulse-dot"></div>
        <span>AI 智能体规划分面 · 推进出题时将在此裂变展开</span>
      </div>
    `;
  } else if (node.type === 'end_node') {
    body.innerHTML = `
      <div class="canvas-node-meta-box end-box">
        <div>✓ 答卷结果汇聚终点</div>
        <div>📦 结构化 Payload 输出</div>
      </div>
    `;
  } else if (node.type === 'logic_node') {
    body.innerHTML = `
      <div class="canvas-node-meta-box logic-box" style="background: rgba(99, 102, 241, 0.08); border: 1px dashed rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 12px; font-size: 0.82rem; color: #cbd5e1; line-height: 1.5;">
        <div><strong>原语类型:</strong> <code style="color: #818cf8;">${node.logicType || ''}</code></div>
        <div style="margin-top: 4px;"><strong>流控策略:</strong> ${node.logicDescription || '动态条件分支推导'}</div>
      </div>
    `;
  } else if (node.questionModel) {
    const q = node.questionModel;
    const plugin = getQuestionPlugin(q.type);

    if (plugin) {
      const previewEl = plugin.renderPreview({
        model: q,
        compact: true,
      });
      body.appendChild(previewEl);
    } else {
      const fallback = document.createElement('div');
      fallback.textContent = '未找到对应题目插件。';
      body.appendChild(fallback);
    }
  }

  card.appendChild(body);
  return card;
}

function getQuestionTypeLabel(type?: string): string {
  switch (type) {
    case 'single_choice':
      return '单选';
    case 'multiple_choice':
      return '多选';
    case 'text_input':
      return '填空/文本';
    case 'likert_scale':
      return '李克特量表';
    default:
      return '通用题目';
  }
}
