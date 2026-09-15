/**
 * server/routes/documents.ts
 *
 * Knowledge base document upload, indexing, retrieval, and deletion endpoints.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { DocumentService } from '../document-service';

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // Max 30MB
});

/**
 * Upload knowledge base document (PDF, Word docx, Markdown, TXT)
 */
documentsRouter.post('/api/documents/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '请选择要上传的文件' });
      return;
    }
    const doc = await DocumentService.processUpload({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    res.status(201).json({ success: true, document: doc });
  } catch (err: any) {
    console.error('[API] uploadDocument error:', err);
    res.status(500).json({ error: err?.message || '文档上传与解析失败' });
  }
});

/**
 * List all uploaded documents
 */
documentsRouter.get('/api/documents', (_req: Request, res: Response) => {
  try {
    const list = DocumentService.listDocuments();
    res.json(list);
  } catch (err) {
    console.error('[API] listDocuments error:', err);
    res.status(500).json({ error: '获取文档列表失败' });
  }
});

/**
 * Get single document details
 */
documentsRouter.get('/api/documents/:id', (req: Request, res: Response) => {
  try {
    const doc = DocumentService.getDocument(req.params.id);
    if (!doc) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    res.json(doc);
  } catch (err) {
    console.error('[API] getDocument error:', err);
    res.status(500).json({ error: '获取文档详情失败' });
  }
});

/**
 * Delete document by ID
 */
documentsRouter.delete('/api/documents/:id', (req: Request, res: Response) => {
  try {
    const success = DocumentService.deleteDocument(req.params.id);
    res.json({ success });
  } catch (err) {
    console.error('[API] deleteDocument error:', err);
    res.status(500).json({ error: '删除文档失败' });
  }
});
