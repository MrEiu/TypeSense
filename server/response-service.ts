/**
 * server/response-service.ts
 *
 * 答卷记录存储服务
 * 职责：接收受访者提交的真实答题数据，算法生成唯一 response ID，关联作答用户信息并存入 SQLite 数据库。
 */

import { db } from './db';
import { generateResponseId } from './id-generator';

export interface SubmitResponsePayload {
  answers: Record<string, unknown>;
  status?: 'completed' | 'disqualified';
  linkCode?: string;
  username?: string;
  userId?: string;
}

export class ResponseService {
  /**
   * 保存答卷记录 (支持关联作答用户信息)
   */
  public static saveResponse(
    surveyIdOrSlug: string,
    payload: SubmitResponsePayload
  ): { success: boolean; id?: string; error?: string } {
    // 1. 确认目标问卷真实存在
    const surveyRow = db.prepare(`SELECT id FROM surveys WHERE id = ? OR slug = ? LIMIT 1`).get(
      surveyIdOrSlug,
      surveyIdOrSlug
    ) as { id: string } | undefined;

    if (!surveyRow) {
      return { success: false, error: '目标问卷不存在' };
    }

    const realSurveyId = surveyRow.id;
    const responseId = generateResponseId();
    const status = payload.status || 'completed';
    const linkCode = payload.linkCode || null;
    const username = payload.username || null;
    const userId = payload.userId || null;
    const answersJson = JSON.stringify(payload.answers || {});
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO survey_responses (id, survey_id, link_code, status, answers_json, username, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(responseId, realSurveyId, linkCode, status, answersJson, username, userId, now);

    return {
      success: true,
      id: responseId,
    };
  }

  /**
   * 查询指定问卷的答卷记录总数及明细
   */
  public static listResponsesBySurvey(surveyIdOrSlug: string): Array<{
    id: string;
    surveyId: string;
    linkCode: string | null;
    status: string;
    answers: Record<string, unknown>;
    username: string | null;
    userId: string | null;
    createdAt: string;
  }> {
    const surveyRow = db.prepare(`SELECT id FROM surveys WHERE id = ? OR slug = ? LIMIT 1`).get(
      surveyIdOrSlug,
      surveyIdOrSlug
    ) as { id: string } | undefined;

    if (!surveyRow) return [];

    const rows = db.prepare(`
      SELECT id, survey_id, link_code, status, answers_json, username, user_id, created_at
      FROM survey_responses
      WHERE survey_id = ?
      ORDER BY created_at DESC
    `).all(surveyRow.id) as Array<{
      id: string;
      survey_id: string;
      link_code: string | null;
      status: string;
      answers_json: string;
      username: string | null;
      user_id: string | null;
      created_at: string;
    }>;

    return rows.map((r) => {
      let answers = {};
      try {
        answers = JSON.parse(r.answers_json);
      } catch {
        answers = {};
      }
      return {
        id: r.id,
        surveyId: r.survey_id,
        linkCode: r.link_code,
        status: r.status,
        answers,
        username: r.username,
        userId: r.user_id,
        createdAt: r.created_at,
      };
    });
  }

  /**
   * 获取指定问卷的回收总答卷数
   */
  public static getResponseCount(surveyId: string): number {
    const row = db.prepare(`
      SELECT COUNT(1) as total FROM survey_responses WHERE survey_id = ?
    `).get(surveyId) as { total: number } | undefined;

    return row?.total || 0;
  }
}
