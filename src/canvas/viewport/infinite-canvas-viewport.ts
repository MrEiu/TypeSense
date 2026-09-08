/**
 * infinite-canvas-viewport.ts
 *
 * 无限幕布视口交互与渲染调度器
 * 职责：集成 @panzoom/panzoom 管理无限平移缩放、网格背景、自组织排版渲染与居中自适应工具条。
 * 契约：所有问卷数据纯动态输入，严禁硬编码。
 */

import Panzoom from '@panzoom/panzoom';
import type { PanzoomObject } from '@panzoom/panzoom';
import type { QuestionnaireModel } from '../../schema/questionnaire-schema-types';
import { QuestionnaireGraphTransformer } from '../services/questionnaire-graph-transformer';
import { CanvasLayoutEngine } from '../services/canvas-layout-engine';
import { renderCanvasNodeCardElement } from '../components/canvas-node-card-element';
import { renderCanvasConnectionLineSvg } from '../components/canvas-connection-line-element';

export interface InfiniteCanvasViewportOptions {
  container: HTMLElement;
  questionnaire: QuestionnaireModel;
}

export class InfiniteCanvasViewport {
  private container: HTMLElement;
  private questionnaire: QuestionnaireModel;
  private panzoomInstance: PanzoomObject | null = null;
  private planeElement!: HTMLElement;
  private layoutEngine: CanvasLayoutEngine;
  private zoomIndicatorPill!: HTMLElement;
  private currentDirection: 'RIGHT' | 'DOWN' = 'RIGHT';

  constructor(options: InfiniteCanvasViewportOptions) {
    this.container = options.container;
    this.questionnaire = options.questionnaire;
    this.layoutEngine = new CanvasLayoutEngine();
  }

  /**
   * 挂载并渲染无限幕布
   */
  public async mount(): Promise<void> {
    this.container.innerHTML = '';

    // 1. 外部视口容器
    const viewport = document.createElement('div');
    viewport.className = 'infinite-canvas-viewport';

    // 2. 内部由 Panzoom 控制的无限位移平面
    this.planeElement = document.createElement('div');
    this.planeElement.className = 'infinite-canvas-plane';
    viewport.appendChild(this.planeElement);

    // 3. 悬浮控制工具栏
    const toolbar = this.createFloatingToolbar();
    viewport.appendChild(toolbar);

    this.container.appendChild(viewport);

    // 4. 初始化 Panzoom
    this.initPanzoom(viewport);

    // 5. 计算自组织排版并渲染图元素
    await this.renderGraphLayout();
  }

  /**
   * 卸载清理
   */
  public destroy(): void {
    if (this.panzoomInstance) {
      this.panzoomInstance.destroy();
      this.panzoomInstance = null;
    }
  }

  /**
   * 计算自组织排版并渲染全部节点与连线
   */
  public async renderGraphLayout(): Promise<void> {
    this.planeElement.innerHTML = `
      <div class="canvas-loading-indicator">
        <div class="canvas-spinner"></div>
        <span>正在运行 ELK 自组织算法推导拓扑...</span>
      </div>
    `;

    try {
      // 1. 转换为抽象图
      const graphModel = QuestionnaireGraphTransformer.transformToGraph(this.questionnaire);

      // 2. 运行 ELK 算法计算几何
      const layoutedGraph = await this.layoutEngine.computeLayout(graphModel, {
        direction: this.currentDirection,
        nodeSpacing: 80,
        layerSpacing: 140,
      });

      this.planeElement.innerHTML = '';

      // 设置位移平面的总尺寸（增加宽裕留白）
      const canvasPadding = 600;
      const fullWidth = layoutedGraph.totalWidth + canvasPadding * 2;
      const fullHeight = layoutedGraph.totalHeight + canvasPadding * 2;
      this.planeElement.style.width = `${fullWidth}px`;
      this.planeElement.style.height = `${fullHeight}px`;

      // 节点定位容器（偏移 padding）
      const contentLayer = document.createElement('div');
      contentLayer.className = 'canvas-content-layer';
      contentLayer.style.position = 'absolute';
      contentLayer.style.left = `${canvasPadding}px`;
      contentLayer.style.top = `${canvasPadding}px`;
      contentLayer.style.width = `${layoutedGraph.totalWidth}px`;
      contentLayer.style.height = `${layoutedGraph.totalHeight}px`;

      // 3. 渲染连线层 (SVG)
      const connectionSvg = renderCanvasConnectionLineSvg(
        layoutedGraph.edges,
        layoutedGraph.totalWidth,
        layoutedGraph.totalHeight
      );
      contentLayer.appendChild(connectionSvg);

      // 4. 渲染节点卡片
      layoutedGraph.nodes.forEach((node) => {
        const cardEl = renderCanvasNodeCardElement(node);
        contentLayer.appendChild(cardEl);
      });

      this.planeElement.appendChild(contentLayer);

      // 5. 自动居中自适应
      setTimeout(() => {
        this.fitToScreen(layoutedGraph.totalWidth, layoutedGraph.totalHeight);
      }, 50);
    } catch (err) {
      console.error('[TypeSense Canvas] 自组织排版失败:', err);
      this.planeElement.innerHTML = `
        <div style="color: #f43f5e; padding: 40px; background: rgba(244, 63, 94, 0.1); border-radius: 12px;">
          自组织排版计算失败: ${String(err)}
        </div>
      `;
    }
  }

  /**
   * 初始化 Panzoom 实例与事件监听
   */
  private initPanzoom(viewport: HTMLElement): void {
    this.panzoomInstance = Panzoom(this.planeElement, {
      maxScale: 2.5,
      minScale: 0.12,
      step: 0.12,
      cursor: 'grab',
      excludeClass: 'canvas-node-card', // 允许用户在卡片内部点击选中交互
    });

    // 滚轮缩放监听
    viewport.addEventListener('wheel', (event: WheelEvent) => {
      if (!this.panzoomInstance) return;
      event.preventDefault();
      this.panzoomInstance.zoomWithWheel(event);
      this.updateZoomIndicator();
    });

    this.planeElement.addEventListener('panzoomchange', () => {
      this.updateZoomIndicator();
    });
  }

  /**
   * 居中并自适应缩放图内容
   */
  public fitToScreen(graphWidth: number, graphHeight: number): void {
    if (!this.panzoomInstance) return;

    const viewportWidth = this.container.clientWidth || window.innerWidth;
    const viewportHeight = this.container.clientHeight || window.innerHeight;

    const scaleX = (viewportWidth * 0.82) / graphWidth;
    const scaleY = (viewportHeight * 0.82) / graphHeight;
    const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.25), 0.95);

    this.panzoomInstance.zoom(targetScale, { animate: true });
    this.panzoomInstance.pan(
      (viewportWidth - graphWidth * targetScale) / 2 - 600 * targetScale,
      (viewportHeight - graphHeight * targetScale) / 2 - 600 * targetScale,
      { animate: true }
    );
    this.updateZoomIndicator();
  }

  /**
   * 更新悬浮缩放比例数值
   */
  private updateZoomIndicator(): void {
    if (!this.panzoomInstance || !this.zoomIndicatorPill) return;
    const scale = this.panzoomInstance.getScale();
    this.zoomIndicatorPill.textContent = `${Math.round(scale * 100)}%`;
  }

  /**
   * 创建悬浮工具栏
   */
  private createFloatingToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'canvas-floating-toolbar';

    // 缩放减少
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'canvas-tool-btn';
    zoomOutBtn.title = '缩小 (Zoom Out)';
    zoomOutBtn.textContent = '−';
    zoomOutBtn.addEventListener('click', () => {
      this.panzoomInstance?.zoomOut();
      this.updateZoomIndicator();
    });

    // 缩放比例
    this.zoomIndicatorPill = document.createElement('span');
    this.zoomIndicatorPill.className = 'canvas-zoom-pill';
    this.zoomIndicatorPill.textContent = '100%';

    // 缩放增加
    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'canvas-tool-btn';
    zoomInBtn.title = '放大 (Zoom In)';
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('click', () => {
      this.panzoomInstance?.zoomIn();
      this.updateZoomIndicator();
    });

    // 居中自适应
    const fitBtn = document.createElement('button');
    fitBtn.type = 'button';
    fitBtn.className = 'canvas-tool-btn canvas-fit-btn';
    fitBtn.title = '全景自适应居中';
    fitBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
      </svg>
      <span>居中全景</span>
    `;
    fitBtn.addEventListener('click', () => {
      this.renderGraphLayout();
    });

    // 排版流向切换 (水平 / 垂直)
    const directionBtn = document.createElement('button');
    directionBtn.type = 'button';
    directionBtn.className = 'canvas-tool-btn canvas-direction-btn';
    directionBtn.title = '切换自组织排列方向';
    directionBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="17 1 21 5 17 9"></polyline>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
        <polyline points="7 23 3 19 7 15"></polyline>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
      </svg>
      <span class="dir-text">水平流向</span>
    `;
    directionBtn.addEventListener('click', () => {
      this.currentDirection = this.currentDirection === 'RIGHT' ? 'DOWN' : 'RIGHT';
      const textSpan = directionBtn.querySelector('.dir-text');
      if (textSpan) {
        textSpan.textContent = this.currentDirection === 'RIGHT' ? '水平流向' : '纵向流向';
      }
      this.renderGraphLayout();
    });

    toolbar.appendChild(zoomOutBtn);
    toolbar.appendChild(this.zoomIndicatorPill);
    toolbar.appendChild(zoomInBtn);
    toolbar.appendChild(fitBtn);
    toolbar.appendChild(directionBtn);

    return toolbar;
  }
}
