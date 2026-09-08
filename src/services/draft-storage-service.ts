/**
 * draft-storage-service.ts
 *
 * 受访端本地断点续答与草稿缓存服务
 * 职责：
 * 1. 采用 LocalStorage 隔离存储各问卷的未提交答卷草稿；
 * 2. 具备 7 天 TTL 超期自动淘汰与坏死数据容错兜底；
 * 3. 支持作答现场（答案表、历史节点栈、当前游标）完整还原；
 * 4. 提交入库或主动放弃后物理清理。
 */

export interface SurveyDraftData {
  surveyId: string;
  cursor: string;
  answers: Record<string, unknown>;
  history: string[];
  updatedAt: number;
  answeredCount: number;
  totalQuestions: number;
}

const STORAGE_PREFIX = 'typesense_draft:';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天过期

export class DraftStorageService {
  /**
   * 生成特定问卷的本地缓存 Key
   */
  private static getKey(surveyId: string): string {
    return `${STORAGE_PREFIX}${surveyId.trim()}`;
  }

  /**
   * 保存或更新草稿
   */
  public static saveDraft(
    surveyId: string,
    payload: {
      cursor: string;
      answers: Record<string, unknown>;
      history: string[];
      totalQuestions: number;
    }
  ): void {
    if (!surveyId || !window.localStorage) return;

    try {
      const answeredCount = Object.keys(payload.answers).length;
      const draft: SurveyDraftData = {
        surveyId: surveyId.trim(),
        cursor: payload.cursor,
        answers: payload.answers,
        history: payload.history,
        updatedAt: Date.now(),
        answeredCount,
        totalQuestions: payload.totalQuestions,
      };

      window.localStorage.setItem(this.getKey(surveyId), JSON.stringify(draft));
    } catch (err) {
      console.warn('[DraftStorage] 写入本地草稿失败（可能达到存储配额）:', err);
    }
  }

  /**
   * 获取草稿（内置 TTL 校验与坏死数据保护）
   */
  public static getDraft(surveyId: string): SurveyDraftData | null {
    if (!surveyId || !window.localStorage) return null;

    try {
      const raw = window.localStorage.getItem(this.getKey(surveyId));
      if (!raw) return null;

      const draft = JSON.parse(raw) as SurveyDraftData;

      // 1. 结构与所属校验
      if (!draft || draft.surveyId !== surveyId.trim() || !draft.answers) {
        this.clearDraft(surveyId);
        return null;
      }

      // 2. TTL 过期判定
      if (Date.now() - draft.updatedAt > DEFAULT_TTL_MS) {
        this.clearDraft(surveyId);
        return null;
      }

      // 3. 有效性（至少填过 1 题）
      if (Object.keys(draft.answers).length === 0) {
        this.clearDraft(surveyId);
        return null;
      }

      return draft;
    } catch {
      this.clearDraft(surveyId);
      return null;
    }
  }

  /**
   * 清除特定问卷草稿
   */
  public static clearDraft(surveyId: string): void {
    if (!surveyId || !window.localStorage) return;
    try {
      window.localStorage.removeItem(this.getKey(surveyId));
    } catch {
      // ignore
    }
  }
}
