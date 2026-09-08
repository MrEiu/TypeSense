/**
 * server/document-service.ts
 *
 * 知识库文档存储与文本抽取服务
 * 职责：
 * 1. 负责上传文件的物理落盘 (data/uploads)；
 * 2. 调度 pdf-parse、mammoth 及原生 UTF-8 编码器解析文件纯文本；
 * 3. 生成元信息摘要、统计字符量并存入 SQLite uploaded_documents 表；
 * 4. 支持按 ID 读取全文与复用检索。
 */

import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOADS_DIR } from './db';
import { generateDocumentId } from './id-generator';

export interface DocumentSummary {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  charCount: number;
  summary: string;
  createdAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  extractedText: string;
}

export class DocumentService {
  /**
   * 处理上传的物理文件，抽取纯文本并入库
   */
  public static async processUpload(file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }): Promise<DocumentDetail> {
    const docId = generateDocumentId();
    const safeBaseName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const physicalFileName = `${docId}_${safeBaseName}`;
    const targetFilePath = path.join(UPLOADS_DIR, physicalFileName);

    // 1. 物理写入磁盘
    fs.writeFileSync(targetFilePath, file.buffer);

    // 2. 智能抽取正文文本
    const extractedText = await this.extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
    const charCount = extractedText.length;

    // 3. 生成文本预览摘要 (前 160 个有效字符)
    const cleanOneLiner = extractedText.replace(/\s+/g, ' ').trim();
    const summary = cleanOneLiner.slice(0, 160) + (cleanOneLiner.length > 160 ? '...' : '');

    const now = new Date().toISOString();

    // 4. 写入 SQLite
    const stmt = db.prepare(`
      INSERT INTO uploaded_documents (
        id, filename, original_name, mime_type, size_bytes, extracted_text, summary, char_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      docId,
      physicalFileName,
      file.originalname,
      file.mimetype || 'application/octet-stream',
      file.size,
      extractedText,
      summary,
      charCount,
      now
    );

    return {
      id: docId,
      filename: physicalFileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      charCount,
      summary,
      extractedText,
      createdAt: now,
    };
  }

  /**
   * 获取所有已上传文档列表
   */
  public static listDocuments(): DocumentSummary[] {
    const rows = db.prepare(`
      SELECT id, filename, original_name, mime_type, size_bytes, summary, char_count, created_at
      FROM uploaded_documents
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      filename: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      summary: string | null;
      char_count: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      originalName: r.original_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes) || 0,
      charCount: Number(r.char_count) || 0,
      summary: r.summary || '',
      createdAt: r.created_at,
    }));
  }

  /**
   * 依据 ID 获取文档完整详情 (含完整正文)
   */
  public static getDocument(id: string): DocumentDetail | null {
    const row = db.prepare(`
      SELECT id, filename, original_name, mime_type, size_bytes, extracted_text, summary, char_count, created_at
      FROM uploaded_documents
      WHERE id = ?
      LIMIT 1
    `).get(id) as {
      id: string;
      filename: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      extracted_text: string;
      summary: string | null;
      char_count: number;
      created_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes) || 0,
      charCount: Number(row.char_count) || 0,
      extractedText: row.extracted_text,
      summary: row.summary || '',
      createdAt: row.created_at,
    };
  }

  /**
   * 删除文档记录及物理文件
   */
  public static deleteDocument(id: string): boolean {
    const doc = this.getDocument(id);
    if (!doc) return false;

    // 删除物理文件
    const physicalPath = path.join(UPLOADS_DIR, doc.filename);
    if (fs.existsSync(physicalPath)) {
      try {
        fs.unlinkSync(physicalPath);
      } catch (err) {
        console.warn(`[DocumentService] 删除物理文件失败: ${physicalPath}`, err);
      }
    }

    // 从数据库移除
    const stmt = db.prepare(`DELETE FROM uploaded_documents WHERE id = ?`);
    const res = stmt.run(id);
    return Number(res.changes) > 0;
  }

  /**
   * 智能文本抽取核心函数
   */
  private static async extractTextFromBuffer(
    buffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<string> {
    const ext = path.extname(filename).toLowerCase();

    // 1. PDF 文件解析
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      try {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        const text = typeof result === 'string' ? result : (result as any)?.text || '';
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      } catch (err) {
        console.warn('[DocumentService] PDFParse 异常，转入文本流兜底解析:', err);
      }
      // 容错兜底：从二进制中抽取所有可打印文本
      return buffer.toString('latin1').replace(/[^\x20-\x7E\u4e00-\u9fa5\n\r\t]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }

    // 2. Word (.docx) 文件解析
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      try {
        const mammoth = (await import('mammoth')).default;
        const res = await mammoth.extractRawText({ buffer });
        return res.value.trim();
      } catch (err) {
        console.warn('[DocumentService] Mammoth 解析 docx 失败:', err);
      }
    }

    // 3. 纯文本、Markdown、JSON、代码文件
    return buffer.toString('utf-8').trim();
  }
}
