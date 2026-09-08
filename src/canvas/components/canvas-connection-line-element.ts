/**
 * canvas-connection-line-element.ts
 *
 * 无限幕布 SVG 连线与流向箭头组件
 * 职责：根据排版引擎输出的端点几何数据，生成平滑三次贝塞尔曲线及流光动效。
 * 契约：纯几何绘制，不包含业务文本硬编码。
 */

import type { LayoutedEdgeItem } from '../services/canvas-layout-engine';

export function renderCanvasConnectionLineSvg(edges: LayoutedEdgeItem[], width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'canvas-connections-layer');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // 定义渐变与箭头 Marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0.9" />
    </linearGradient>
    <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#a855f7" />
    </marker>
  `;
  svg.appendChild(defs);

  edges.forEach((edge) => {
    const { startPoint, endPoint } = edge;

    // 计算平滑水平贝塞尔控制点
    const dx = Math.abs(endPoint.x - startPoint.x);
    const cpOffset = Math.max(dx * 0.45, 50);

    const pathData = `M ${startPoint.x} ${startPoint.y} C ${startPoint.x + cpOffset} ${startPoint.y}, ${endPoint.x - cpOffset} ${endPoint.y}, ${endPoint.x} ${endPoint.y}`;

    // 底层发光阴影路径
    const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glowPath.setAttribute('d', pathData);
    glowPath.setAttribute('class', 'edge-path-glow');
    svg.appendChild(glowPath);

    // 主连线路径
    const mainPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    mainPath.setAttribute('d', pathData);
    mainPath.setAttribute('class', 'edge-path-main');
    mainPath.setAttribute('marker-end', 'url(#arrowHead)');
    svg.appendChild(mainPath);

    // 边标签文字 (如 "下一题")
    if (edge.label) {
      const midX = (startPoint.x + endPoint.x) / 2;
      const midY = (startPoint.y + endPoint.y) / 2 - 10;

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(midX));
      text.setAttribute('y', String(midY));
      text.setAttribute('class', 'edge-label-text');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = edge.label;
      svg.appendChild(text);
    }
  });

  return svg;
}
