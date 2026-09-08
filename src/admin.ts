/**
 * admin.ts
 *
 * 管理端自组织无限幕布主入口 (admin.html)
 * 职责：异步拉取问卷 JSON 数据，初始化并挂载自组织无限幕布视口（ELK 分层拓扑 + Panzoom 漫游）。
 * 契约：严禁包含任何特定问卷题目的硬编码文案。
 */

import { QuestionnaireRepositoryService } from './services/questionnaire-repository-service';
import { InfiniteCanvasViewport } from './canvas/viewport/infinite-canvas-viewport';
import type { QuestionnaireModel } from './schema/questionnaire-schema-types';

class AdminCanvasApp {
  private container: HTMLElement;
  private questionnaire!: QuestionnaireModel;
  private canvasViewport: InfiniteCanvasViewport | null = null;
  private currentSurveyId = 'survey_tech_2026';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    const urlParams = new URLSearchParams(window.location.search);
    this.currentSurveyId = urlParams.get('id') || urlParams.get('survey') || 'survey_tech_2026';

    this.showLoading();

    try {
      this.questionnaire = await QuestionnaireRepositoryService.getSurvey(this.currentSurveyId);
      this.renderAdminLayout();
    } catch (err) {
      this.showError(err);
    }
  }

  private renderAdminLayout(): void {
    this.container.innerHTML = '';

    // 管理端顶栏
    const respondentUrl = `/survey.html?id=${encodeURIComponent(this.currentSurveyId)}`;
    const adminHeader = document.createElement('header');
    adminHeader.className = 'admin-canvas-header';
    adminHeader.innerHTML = `
      <div class="admin-header-brand">
        <span class="brand-badge">ADMIN</span>
        <span class="brand-title">TypeSense 流程拓扑幕布 · ${this.questionnaire.title}</span>
      </div>
      <div class="admin-header-actions">
        <a href="/" class="action-pill-btn" style="text-decoration: none;" title="返回发布控制台">
          <span>← 返回控制台</span>
        </a>
        <a href="${respondentUrl}" target="_blank" class="action-pill-btn" style="text-decoration: none;" title="在受访端作答">
          <span>↗ 受访作答</span>
        </a>
        <button type="button" class="action-pill-btn refresh-layout-btn">
          <span>⟳ 重新计算排版</span>
        </button>
      </div>
    `;

    this.container.appendChild(adminHeader);

    // 画布挂载容器
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'admin-canvas-stage';
    this.container.appendChild(canvasContainer);

    // 挂载视口
    this.canvasViewport = new InfiniteCanvasViewport({
      container: canvasContainer,
      questionnaire: this.questionnaire,
    });

    this.canvasViewport.mount();

    // 绑定刷新排版事件
    adminHeader.querySelector('.refresh-layout-btn')?.addEventListener('click', () => {
      this.canvasViewport?.renderGraphLayout();
    });
  }

  private showLoading(): void {
    this.container.innerHTML = `
      <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: #94a3b8; background: #060911;">
        <div style="width: 44px; height: 44px; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="font-size: 0.95rem;">正在加载管理端无限幕布...</p>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      </div>
    `;
  }

  private showError(err: unknown): void {
    this.container.innerHTML = `
      <div style="max-width: 600px; margin: 80px auto; padding: 32px; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 14px; text-align: center; color: #fff;">
        <h2 style="color: #f43f5e; margin-bottom: 12px;">加载失败</h2>
        <pre style="background: #090e1a; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 0.8rem; color: #f87171; text-align: left;">${String(err)}</pre>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('admin-app');
  if (root) {
    const app = new AdminCanvasApp(root);
    app.init();
  }
});
