/**
 * server/survey-service.ts
 *
 * 问卷实体与短链服务
 * 职责：负责 surveys 表与 survey_links 表的持久化 CRUD，统一由算法生成全局唯一 ID 与短访问码。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db';
import { generateSurveyId, generateShortCode } from './id-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SurveySummaryItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  questionsCount: number;
  responseCount: number;
  createdAt: string;
}

export class SurveyService {
  /**
   * 获取所有问卷列表及当前已收集答卷数
   */
  public static listSurveys(): SurveySummaryItem[] {
    const rows = db.prepare(`
      SELECT 
        s.id, 
        s.slug, 
        s.title, 
        s.description, 
        s.schema_json,
        s.created_at,
        COUNT(r.id) as response_count
      FROM surveys s
      LEFT JOIN survey_responses r ON s.id = r.survey_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all() as Array<{
      id: string;
      slug: string;
      title: string;
      description: string | null;
      schema_json: string;
      created_at: string;
      response_count: number;
    }>;

    return rows.map((row) => {
      let questionsCount = 0;
      try {
        const parsed = JSON.parse(row.schema_json);
        questionsCount = Array.isArray(parsed.questions) ? parsed.questions.length : 0;
      } catch {
        questionsCount = 0;
      }

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description || '',
        questionsCount,
        responseCount: Number(row.response_count) || 0,
        createdAt: row.created_at,
      };
    });
  }

  /**
   * 按算法生成 ID 或语义 Slug 获取完整问卷
   */
  public static getSurvey(idOrSlug: string): Record<string, unknown> | null {
    const row = db.prepare(`
      SELECT id, slug, schema_json FROM surveys 
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).get(idOrSlug, idOrSlug) as { id: string; slug: string; schema_json: string } | undefined;

    if (!row) return null;

    try {
      const parsed = JSON.parse(row.schema_json) as Record<string, unknown>;
      // 保证返回的问卷对象中 id 为算法生成的唯一标识
      parsed.id = row.id;
      parsed.slug = row.slug;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * 新建或发布问卷（ID 强制由算法生成）
   */
  public static createSurvey(data: {
    title: string;
    description?: string;
    slug?: string;
    schema: Record<string, unknown>;
  }): { id: string; slug: string } {
    const surveyId = generateSurveyId();
    const slug = data.slug && data.slug.trim() ? data.slug.trim() : surveyId;
    const now = new Date().toISOString();

    const schemaToSave = {
      ...data.schema,
      id: surveyId,
      slug,
      title: data.title,
      description: data.description || '',
    };

    const stmt = db.prepare(`
      INSERT INTO surveys (id, slug, title, description, schema_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      surveyId,
      slug,
      data.title,
      data.description || '',
      JSON.stringify(schemaToSave, null, 2),
      now,
      now
    );

    return { id: surveyId, slug };
  }

  /**
   * 删除问卷
   */
  public static deleteSurvey(idOrSlug: string): boolean {
    const stmt = db.prepare(`DELETE FROM surveys WHERE id = ? OR slug = ?`);
    const result = stmt.run(idOrSlug, idOrSlug);
    return Number(result.changes) > 0;
  }

  /**
   * 为问卷算法生成一个唯一访问短码
   */
  public static createLink(surveyIdOrSlug: string): { code: string; surveyId: string } | null {
    // 确认问卷存在并取得算法真实 ID
    const surveyRow = db.prepare(`SELECT id FROM surveys WHERE id = ? OR slug = ? LIMIT 1`).get(
      surveyIdOrSlug,
      surveyIdOrSlug
    ) as { id: string } | undefined;

    if (!surveyRow) return null;

    const realSurveyId = surveyRow.id;
    const shortCode = generateShortCode();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO survey_links (code, survey_id, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(shortCode, realSurveyId, now);

    return { code: shortCode, surveyId: realSurveyId };
  }

  /**
   * 根据短访问码解析目标问卷 ID
   */
  public static resolveLink(code: string): string | null {
    const row = db.prepare(`SELECT survey_id FROM survey_links WHERE code = ? LIMIT 1`).get(code) as
      | { survey_id: string }
      | undefined;
    return row ? row.survey_id : null;
  }

  /**
   * 首次启动自动将 static JSON 问卷作为种子数据入库
   */
  public static initSeedSurveys(): void {
    const surveysDir = path.resolve(__dirname, '../public/data/surveys');
    if (fs.existsSync(surveysDir)) {
      const files = fs.readdirSync(surveysDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');

      files.forEach((file) => {
      try {
        const filePath = path.join(surveysDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        const slug = parsed.id || path.basename(file, '.json');
        const existing = db.prepare(`SELECT id FROM surveys WHERE slug = ?`).get(slug) as { id: string } | undefined;

        if (existing) {
          // 同步最新 schema 内容
          const schemaToSave = {
            ...parsed,
            id: existing.id,
            slug,
          };
          db.prepare(`
            UPDATE surveys SET schema_json = ?, title = ?, description = ?, updated_at = ?
            WHERE id = ?
          `).run(JSON.stringify(schemaToSave, null, 2), parsed.title || slug, parsed.description || '', new Date().toISOString(), existing.id);
          return;
        }

        const surveyId = generateSurveyId();
        const now = new Date().toISOString();

        const schemaToSave = {
          ...parsed,
          id: surveyId,
          slug,
        };

        db.prepare(`
          INSERT INTO surveys (id, slug, title, description, schema_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          surveyId,
          slug,
          parsed.title || slug,
          parsed.description || '',
          JSON.stringify(schemaToSave, null, 2),
          now,
          now
        );

        // 默认自动配一个访问短码
        const defaultCode = generateShortCode();
        db.prepare(`
          INSERT INTO survey_links (code, survey_id, created_at)
          VALUES (?, ?, ?)
        `).run(defaultCode, surveyId, now);

        console.info(`[SurveyService] 种子问卷 [${slug}] 已导入数据库，ID: ${surveyId}，短码: ${defaultCode}`);
      } catch (err) {
        console.error(`[SurveyService] 导入种子问卷 ${file} 失败:`, err);
      }
    });
  }

    // 确保库中至少拥有一份开箱即用的默认示范问卷 (survey_tech_2026)
    const seedSlug = 'survey_tech_2026';
    const existingSeed = db.prepare(`SELECT id FROM surveys WHERE slug = ? OR id = ?`).get(seedSlug, seedSlug);
    if (!existingSeed) {
      const defaultSeed = {
        id: seedSlug,
        title: '2026 开发者效能与工程体验调查',
        description: '本问卷旨在了解您在日常研发实践中的真实感受，支持有向图拓扑跳转与自组织排版。',
        questions: [
          {
            id: 'q1',
            type: 'single_choice',
            title: '您目前主要负责的研发角色是什么？',
            required: true,
            options: ['前端开发', '后端开发', '全栈开发', 'AI / 算法工程师', '技术主管 / 架构师'],
            jump: [
              { when: { q1: 0 }, to: 'q2' },
              { when: { q1: 1 }, to: 'q3' },
              { else: true, to: 'q2' },
            ],
          },
          {
            id: 'q2',
            type: 'multiple_choice',
            title: '您在日常项目中经常使用的开发工具与实践有哪些？',
            required: true,
            options: [
              'TypeScript 静态类型约束',
              'CI/CD 自动化流水线',
              'AI 辅助编程与代码生成',
              '模块化与清晰目录边界',
              '自动化单元测试',
            ],
          },
          {
            id: 'q3',
            type: 'likert_scale',
            title: '您对“AI 工具显著提升了日常开发交付效率”的认同程度：',
            required: true,
            options: ['强烈不赞同', '不太赞同', '中立', '基本赞同', '非常赞同'],
          },
          {
            id: 'q4',
            type: 'likert_scale',
            title: '您对当前团队代码架构规范与维护性的满意度：',
            required: true,
            options: ['非常不满意', '不满意', '一般', '满意', '非常满意'],
          },
          {
            id: 'q5',
            type: 'text_input',
            title: '您对提升团队研发体验有何具体建议或想法？',
            required: false,
            placeholder: '请输入您的建议或想法...',
          },
        ],
      };
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO surveys (id, slug, title, description, schema_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        seedSlug,
        seedSlug,
        defaultSeed.title,
        defaultSeed.description,
        JSON.stringify(defaultSeed, null, 2),
        now,
        now
      );
      db.prepare(`
        INSERT INTO survey_links (code, survey_id, created_at)
        VALUES (?, ?, ?)
      `).run('tech2026', seedSlug, now);
      console.info(`[SurveyService] 默认示范问卷 [${seedSlug}] 已导入数据库。`);
    }
  }
}
