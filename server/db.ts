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

// 保证 data 与 uploads 目录存在
export const DATA_DIR = path.resolve(__dirname, '../data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

  CREATE TABLE IF NOT EXISTS uploaded_documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    extracted_text TEXT NOT NULL,
    summary TEXT,
    char_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_uploaded_documents_created ON uploaded_documents(created_at DESC);

  CREATE TABLE IF NOT EXISTS ai_generation_sessions (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    user_prompt TEXT NOT NULL,
    target_count INTEGER NOT NULL,
    blueprint_json TEXT,
    survey_id TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ai_sessions_created ON ai_generation_sessions(created_at DESC);
`);

