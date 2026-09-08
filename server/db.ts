/**
 * server/db.ts
 *
 * Node.js 原生 SQLite 结构化存储管理模块
 * 职责：
 * 1. 自动初始化数据库目录 data/typesense.db；
 * 2. 启用 WAL 高性能高并发日志模式及外键约束；
 * 3. 建立 surveys, survey_links, survey_responses 标准关系表；
 * 4. 导出全局单例数据库连接。
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 保证 data 目录存在
const DATA_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'typesense.db');

export const db = new DatabaseSync(DB_PATH);

// 开启性能优化与外键
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// 建立表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS surveys (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    schema_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_surveys_slug ON surveys(slug);

  CREATE TABLE IF NOT EXISTS survey_links (
    code TEXT PRIMARY KEY,
    survey_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_survey_links_survey ON survey_links(survey_id);

  CREATE TABLE IF NOT EXISTS survey_responses (
    id TEXT PRIMARY KEY,
    survey_id TEXT NOT NULL,
    link_code TEXT,
    status TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
`);
