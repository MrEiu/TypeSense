/**
 * server/survey-service.ts
 *
 * 问卷实体与短链服务
 * 职责：负责 surveys 表与 survey_links 表的持久化 CRUD，统一由算法生成全局唯一 ID 与短访问码。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, SURVEYS_DIR } from './db';
import { generateSurveyId, generateShortCode } from './id-generator';
import { normalizeQuestionnaire, SchemaValidator } from '../src/schema';

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
  status: 'published' | 'paused';
}

export class SurveyService {
  /**
   * Helper: Get absolute file path for a survey JSON file
   */
  public static getSurveyFilePath(id: string): string {
    return path.join(SURVEYS_DIR, `${id}.json`);
  }

  /**
   * Helper: Read survey directly from file system
   */
  public static readSurveyFile(id: string): Record<string, unknown> | null {
    try {
      const filePath = this.getSurveyFilePath(id);
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      console.error(`[SurveyService] Failed to read survey file for ${id}:`, err);
      return null;
    }
  }

  /**
   * Helper: Write survey directly to file system
   */
  public static writeSurveyFile(id: string, data: Record<string, unknown>): void {
    const filePath = this.getSurveyFilePath(id);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Helper: Delete survey file from file system
   */
  public static deleteSurveyFile(id: string): void {
    const filePath = this.getSurveyFilePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Database to file system migration:
   * Migrates all surveys from SQLite database table to data/surveys/<id>.json
   */
  public static migrateSurveysFromDbToFileSystem(): { migratedCount: number; skippedCount: number } {
    let migratedCount = 0;
    let skippedCount = 0;

    try {
      const rows = db.prepare(`SELECT id, slug, title, description, schema_json FROM surveys`).all() as Array<{
        id: string;
        slug: string;
        title: string;
        description: string | null;
        schema_json: string;
      }>;

      for (const row of rows) {
        const filePath = this.getSurveyFilePath(row.id);
        if (!fs.existsSync(filePath)) {
          try {
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(row.schema_json);
            } catch {
              parsed = {
                id: row.id,
                slug: row.slug,
                title: row.title,
                description: row.description || '',
                questions: [],
              };
            }
            parsed.id = row.id;
            parsed.slug = row.slug || row.id;
            if (!parsed.title) parsed.title = row.title;
            this.writeSurveyFile(row.id, parsed);
            migratedCount++;
          } catch (err) {
            console.error(`[SurveyService] Failed to migrate survey ${row.id}:`, err);
          }
        } else {
          skippedCount++;
        }
      }

      if (migratedCount > 0) {
        console.info(`[SurveyService] Successfully migrated ${migratedCount} survey(s) from SQLite to data/surveys/`);
      }
    } catch (err) {
      console.error('[SurveyService] Survey migration error:', err);
    }

    return { migratedCount, skippedCount };
  }

  /**
   * List all surveys and their response counts
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
      let status: 'published' | 'paused' = 'published';
      let title = row.title;
      let description = row.description || '';

      // Prefer reading file content from data/surveys/ if present
      const fileData = this.readSurveyFile(row.id);
      if (fileData) {
        if (Array.isArray(fileData.questions)) {
          questionsCount = fileData.questions.length;
        }
        if (fileData.status === 'paused') {
          status = 'paused';
        }
        if (typeof fileData.title === 'string' && fileData.title) {
          title = fileData.title;
        }
        if (typeof fileData.description === 'string') {
          description = fileData.description;
        }
      } else {
        try {
          const parsed = JSON.parse(row.schema_json);
          questionsCount = Array.isArray(parsed.questions) ? parsed.questions.length : 0;
          if (parsed.status === 'paused') {
            status = 'paused';
          }
        } catch {
          questionsCount = 0;
        }
      }

      return {
        id: row.id,
        slug: row.slug,
        title,
        description,
        questionsCount,
        responseCount: Number(row.response_count) || 0,
        createdAt: row.created_at,
        status,
      };
    });
  }

  /**
   * Get full survey definition by generated ID or slug (reads from data/surveys/<id>.json)
   */
  public static getSurvey(idOrSlug: string): Record<string, unknown> | null {
    // 1. Check direct file by ID
    const directFile = this.readSurveyFile(idOrSlug);
    if (directFile) {
      if (!directFile.status) directFile.status = 'published';
      return directFile;
    }

    // 2. Lookup ID by slug or ID in SQLite
    const row = db.prepare(`
      SELECT id, slug, schema_json FROM surveys 
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).get(idOrSlug, idOrSlug) as { id: string; slug: string; schema_json: string } | undefined;

    if (!row) return null;

    // 3. Check resolved ID file
    const resolvedFile = this.readSurveyFile(row.id);
    if (resolvedFile) {
      if (!resolvedFile.status) resolvedFile.status = 'published';
      return resolvedFile;
    }

    // 4. Fallback to DB schema_json and write file for future fast reads
    try {
      const parsed = JSON.parse(row.schema_json) as Record<string, unknown>;
      parsed.id = row.id;
      parsed.slug = row.slug;
      if (!parsed.status) parsed.status = 'published';
      this.writeSurveyFile(row.id, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Update survey collection status (published/paused)
   */
  public static updateSurveyStatus(idOrSlug: string, status: 'published' | 'paused'): boolean {
    const row = db.prepare(`
      SELECT id, slug, schema_json FROM surveys 
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).get(idOrSlug, idOrSlug) as { id: string; slug: string; schema_json: string } | undefined;

    if (!row) return false;

    try {
      let parsed = this.readSurveyFile(row.id);
      if (!parsed) {
        parsed = JSON.parse(row.schema_json || '{}');
      }
      parsed.status = status;
      this.writeSurveyFile(row.id, parsed);

      const now = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE surveys 
        SET schema_json = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(JSON.stringify(parsed, null, 2), now, row.id);
      return true;
    } catch (err) {
      console.error('[SurveyService] Failed to update status:', err);
      return false;
    }
  }

  /**
   * Update existing survey content (schema, questions, title, description)
   */
  public static updateSurvey(
    idOrSlug: string,
    data: {
      title?: string;
      description?: string;
      schema: Record<string, unknown>;
    }
  ): boolean {
    const row = db.prepare(`
      SELECT id, slug, schema_json FROM surveys 
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).get(idOrSlug, idOrSlug) as { id: string; slug: string; schema_json: string } | undefined;

    if (!row) return false;

    try {
      const now = new Date().toISOString();
      let existingParsed = this.readSurveyFile(row.id);
      if (!existingParsed) {
        existingParsed = JSON.parse(row.schema_json || '{}');
      }

      const title = data.title || existingParsed.title || '未命名问卷';
      const description = data.description !== undefined ? data.description : (existingParsed.description || '');

      const mergedSchema = normalizeQuestionnaire({
        ...existingParsed,
        ...data.schema,
        id: row.id,
        slug: row.slug,
        title,
        description,
        updatedAt: now,
      });

      const validation = SchemaValidator.validateQuestionnaire(mergedSchema);
      if (!validation.isValid) {
        console.warn(`[SurveyService] Questionnaire schema warnings for ${row.id}:`, validation.errors);
      }

      // Write to data/surveys/<id>.json
      this.writeSurveyFile(row.id, mergedSchema);

      // Sync SQLite row
      const stmt = db.prepare(`
        UPDATE surveys 
        SET title = ?, description = ?, schema_json = ?, updated_at = ?
        WHERE id = ?
      `);
      const result = stmt.run(title, description, JSON.stringify(mergedSchema, null, 2), now, row.id);
      return Number(result.changes) > 0;
    } catch (err) {
      console.error('[SurveyService] Failed to update survey content:', err);
      return false;
    }
  }

  /**
   * Create or publish survey
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

    const schemaToSave = normalizeQuestionnaire({
      ...data.schema,
      id: surveyId,
      slug,
      title: data.title,
      description: data.description || '',
      createdAt: now,
      updatedAt: now,
    });

    const validation = SchemaValidator.validateQuestionnaire(schemaToSave);
    if (!validation.isValid) {
      console.warn(`[SurveyService] Created questionnaire schema warnings for ${surveyId}:`, validation.errors);
    }

    // 1. Write file to data/surveys/<id>.json
    this.writeSurveyFile(surveyId, schemaToSave);

    // 2. Sync to SQLite for FK integrity (links and responses)
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
   * Delete survey and its file
   */
  public static deleteSurvey(idOrSlug: string): boolean {
    const row = db.prepare(`SELECT id FROM surveys WHERE id = ? OR slug = ? LIMIT 1`).get(
      idOrSlug,
      idOrSlug
    ) as { id: string } | undefined;

    const targetId = row ? row.id : idOrSlug;

    // Remove file
    this.deleteSurveyFile(targetId);

    // Remove DB record
    const stmt = db.prepare(`DELETE FROM surveys WHERE id = ? OR slug = ?`);
    const result = stmt.run(idOrSlug, idOrSlug);
    return Number(result.changes) > 0;
  }

  /**
   * Generate unique short link code for a survey
   */
  public static createLink(surveyIdOrSlug: string): { code: string; surveyId: string } | null {
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
   * Resolve target survey ID from short code
   */
  public static resolveLink(code: string): string | null {
    const row = db.prepare(`SELECT survey_id FROM survey_links WHERE code = ? LIMIT 1`).get(code) as
      | { survey_id: string }
      | undefined;
    return row ? row.survey_id : null;
  }

  /**
   * Initialize default seed surveys and sync them to data/surveys/
   */
  public static initSeedSurveys(): void {
    // Run DB migration first
    this.migrateSurveysFromDbToFileSystem();

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
      this.writeSurveyFile(seedSlug, defaultSeed);

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
      console.info(`[SurveyService] Default seed survey [${seedSlug}] initialized and saved to data/surveys/.`);
    } else {
      // Ensure seed survey file exists on disk
      if (!fs.existsSync(this.getSurveyFilePath(seedSlug))) {
        const row = db.prepare(`SELECT schema_json FROM surveys WHERE id = ? OR slug = ? LIMIT 1`).get(seedSlug, seedSlug) as { schema_json: string } | undefined;
        if (row) {
          try {
            this.writeSurveyFile(seedSlug, JSON.parse(row.schema_json));
          } catch {
            // ignore
          }
        }
      }
    }
  }
}

