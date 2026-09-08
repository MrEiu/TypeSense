/**
 * questionnaire-repository-service.ts
 *
 * 问卷仓储与访问链接服务（对接真实后端 REST API）
 * 职责：
 * 1. 废弃浏览器 localStorage 模拟，全量基于后端 SQLite 数据库进行问卷读取与持久化；
 * 2. 对接后端短链网关，获取算法生成的唯一访问短链；
 * 3. 提交受访者作答数据真实持久化入库。
 */

import type { QuestionnaireModel } from '../schema/questionnaire-schema-types';
import { QuestionnaireLoaderService } from './questionnaire-loader-service';

export interface SurveyMetadataItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  questionsCount: number;
  responseCount: number;
  createdAt: string;
  isStatic?: boolean;
  status: 'published' | 'draft';
}

export class QuestionnaireRepositoryService {
  /**
   * 从后端数据库获取所有已发布的问卷列表
   */
  public static async listSurveys(): Promise<SurveyMetadataItem[]> {
    try {
      const resp = await fetch('/api/surveys');
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as Array<{
        id: string;
        slug: string;
        title: string;
        description: string;
        questionsCount: number;
        responseCount: number;
        createdAt: string;
      }>;

      return data.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        questionsCount: item.questionsCount,
        responseCount: item.responseCount || 0,
        createdAt: item.createdAt,
        status: 'published',
      }));
    } catch (err) {
      console.warn('[RepositoryService] 从后端拉取问卷列表失败，回退至静态文件兜底:', err);
      return this.fallbackListStaticSurveys();
    }
  }

  /**
   * 依据算法 ID 或 Slug 从后端数据库装载问卷
   */
  public static async getSurvey(idOrSlug: string): Promise<QuestionnaireModel> {
    if (!idOrSlug || idOrSlug.trim() === '') {
      throw new Error('未指定问卷唯一 ID。');
    }

    try {
      const resp = await fetch(`/api/surveys/${encodeURIComponent(idOrSlug)}`);
      if (resp.ok) {
        const json = await resp.json();
        return QuestionnaireLoaderService.validateAndNormalize(json);
      }
    } catch (err) {
      console.warn(`[RepositoryService] 从后端拉取问卷 ${idOrSlug} 失败，尝试本地兜底:`, err);
    }

    // 本地文件兜底（例如在无网络离线静态模式下）
    const staticUrl = `/data/surveys/${idOrSlug}.json`;
    return await QuestionnaireLoaderService.loadFromUrl(staticUrl);
  }

  /**
   * 向后端发布/存储新问卷（后端算法分配全局唯一 ID）
   */
  public static async publishSurvey(survey: QuestionnaireModel): Promise<{ id: string; slug: string; title: string }> {
    const validated = QuestionnaireLoaderService.validateAndNormalize(survey);

    const resp = await fetch('/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: validated.title,
        description: validated.description,
        slug: validated.id,
        schema: validated,
      }),
    });

    if (!resp.ok) {
      throw new Error(`发布问卷失败: HTTP ${resp.status}`);
    }

    const result = (await resp.json()) as { success: boolean; id: string; slug: string };
    return { id: result.id, slug: result.slug, title: validated.title };
  }

  /**
   * 从后端删除问卷
   */
  public static async deleteSurvey(idOrSlug: string): Promise<boolean> {
    try {
      const resp = await fetch(`/api/surveys/${encodeURIComponent(idOrSlug)}`, {
        method: 'DELETE',
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * 为问卷在后端算法生成一个唯一访问短码
   */
  public static async generateShortLink(surveyIdOrSlug: string): Promise<string> {
    try {
      const resp = await fetch(`/api/surveys/${encodeURIComponent(surveyIdOrSlug)}/links`, {
        method: 'POST',
      });
      if (resp.ok) {
        const data = await resp.json();
        const origin = window.location.origin;
        return `${origin}/s/${data.code}`;
      }
    } catch (err) {
      console.warn('[RepositoryService] 请求后端生成短链失败:', err);
    }

    // 降级链接
    return this.generateAccessUrl(surveyIdOrSlug);
  }

  /**
   * 受访者向后端真正提交答卷并落盘
   */
  public static async submitResponse(
    surveyId: string,
    payload: { answers: Record<string, unknown>; status?: 'completed' | 'disqualified'; linkCode?: string }
  ): Promise<{ success: boolean; id?: string }> {
    try {
      const resp = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        return (await resp.json()) as { success: boolean; id: string };
      }
    } catch (err) {
      console.error('[RepositoryService] 答卷提交网络异常:', err);
    }

    return { success: false };
  }

  /**
   * 生成直接访问链接
   */
  public static generateAccessUrl(surveyIdOrSlug: string): string {
    const base = window.location.origin;
    return `${base}/survey.html?id=${encodeURIComponent(surveyIdOrSlug)}`;
  }

  /**
   * 生成拓扑画布链接
   */
  public static generateCanvasUrl(surveyIdOrSlug: string): string {
    const base = window.location.origin;
    return `${base}/admin.html?id=${encodeURIComponent(surveyIdOrSlug)}`;
  }

  /**
   * 静态清单本地读取兜底
   */
  private static async fallbackListStaticSurveys(): Promise<SurveyMetadataItem[]> {
    try {
      const resp = await fetch('/data/surveys/manifest.json');
      if (resp.ok) {
        const items = (await resp.json()) as Array<{
          id: string;
          title: string;
          description?: string;
          questionsCount: number;
          createdAt: string;
        }>;
        return items.map((item) => ({
          id: item.id,
          slug: item.id,
          title: item.title,
          description: item.description || '',
          questionsCount: item.questionsCount,
          responseCount: 0,
          createdAt: item.createdAt,
          isStatic: true,
          status: 'published',
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }
}
