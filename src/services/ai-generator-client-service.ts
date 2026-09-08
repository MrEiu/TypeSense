/**
 * src/services/ai-generator-client-service.ts
 *
 * 前端与后端 AI 四阶流水线流式通信与知识库文档交互客户端
 */

import type { QuestionnaireModel } from '../schema/questionnaire-schema-types';

export interface DocumentItem {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  charCount: number;
  summary: string;
  createdAt: string;
}

export interface AiPipelineStreamEvent {
  type: 'stage_start' | 'blueprint_ready' | 'question_drafted' | 'logic_woven' | 'audited' | 'persisted' | 'completed' | 'error';
  stage?: 'planning' | 'drafting' | 'weaving' | 'auditing';
  message?: string;
  blueprint?: any;
  question?: any;
  index?: number;
  total?: number;
  questionsWithLogic?: any[];
  auditLog?: string[];
  survey?: QuestionnaireModel;
  sessionId?: string;
  surveyId?: string;
  accessUrl?: string;
  canvasUrl?: string;
  error?: string;
}

export class AiGeneratorClientService {
  /**
   * 上传知识文档到后端数据库
   */
  public static async uploadDocument(file: File): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append('file', file);

    const resp = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `上传失败 (HTTP ${resp.status})`);
    }

    const json = await resp.json();
    return json.document;
  }

  /**
   * 获取已存储的知识文档列表
   */
  public static async listDocuments(): Promise<DocumentItem[]> {
    const resp = await fetch('/api/documents');
    if (!resp.ok) {
      throw new Error(`获取文档失败 (HTTP ${resp.status})`);
    }
    return (await resp.json()) as DocumentItem[];
  }

  /**
   * 删除知识文档
   */
  public static async deleteDocument(id: string): Promise<boolean> {
    const resp = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return resp.ok;
  }

  /**
   * 启动四阶流水线并订阅 SSE 流式事件
   */
  public static async startGenerationStream(
    params: {
      documentId?: string;
      prompt: string;
      targetCount: number;
      enableJumpLogic?: boolean;
    },
    onEvent: (event: AiPipelineStreamEvent) => void
  ): Promise<void> {
    const resp = await fetch('/api/ai/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!resp.ok || !resp.body) {
      throw new Error(`启动生成流水线失败: HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const rawData = trimmed.replace(/^data:\s*/, '').trim();
        if (rawData === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(rawData) as AiPipelineStreamEvent;
          onEvent(parsed);
        } catch (e) {
          console.warn('[AiClient] 解析 SSE 帧失败:', rawData, e);
        }
      }
    }
  }
}
