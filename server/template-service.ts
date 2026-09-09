/**
 * server/template-service.ts
 *
 * 逻辑流转模板管理服务
 * 职责：
 * 1. 动态扫描 data/logic-templates 目录中的所有模板 JSON 文件（非硬编码，热插拔）；
 * 2. 导出标准模板列表供前端选择；
 * 3. 将用户勾选的模板拓扑结构注入 AI 生成上下文。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QuestionItemModel } from '../src/schema/questionnaire-schema-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEMPLATES_DIR = path.resolve(__dirname, '../data/logic-templates');

export interface LogicTemplateItem {
  id: string;
  name: string;
  description: string;
  filename: string;
  rawContent: string;
  questions: QuestionItemModel[];
}

export class TemplateService {
  /**
   * 确保模板目录存在
   */
  public static ensureDir(): void {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }
  }

  /**
   * 动态列出 data/logic-templates 目录下的所有逻辑模板
   */
  public static listTemplates(): LogicTemplateItem[] {
    this.ensureDir();
    try {
      const files = fs.readdirSync(TEMPLATES_DIR);
      const list: LogicTemplateItem[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(TEMPLATES_DIR, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const json = JSON.parse(content);
          if (json && (Array.isArray(json.questions) || json.name)) {
            list.push({
              id: json.id || file.replace(/\.json$/, ''),
              name: json.name || file,
              description: json.description || '自定义逻辑流转模板',
              filename: file,
              rawContent: content,
              questions: json.questions || [],
            });
          }
        } catch (err) {
          console.warn(`[TemplateService] 读取模板 ${file} 失败:`, err);
        }
      }

      return list;
    } catch (err) {
      console.error('[TemplateService] listTemplates 异常:', err);
      return [];
    }
  }

  /**
   * 获取单个逻辑模板详情
   */
  public static getTemplate(idOrFilename: string): LogicTemplateItem | null {
    const all = this.listTemplates();
    return all.find((t) => t.id === idOrFilename || t.filename === idOrFilename) || null;
  }

  /**
   * 将选中的逻辑模板注入 AI 上下文 (直接无损读取文件原始内容，零二次人工提炼，保障大模型获取 100% 原始 JSON 语义)
   */
  public static formatTemplatesForPrompt(templateIds?: string[]): string {
    if (!templateIds || templateIds.length === 0) return '';
    const all = this.listTemplates();
    const selected = all.filter(
      (t) => templateIds.includes(t.id) || templateIds.includes(t.filename)
    );
    if (selected.length === 0) return '';

    return selected
      .map((t) => {
        return `【参考逻辑流转模板：${t.name}】（文件: ${t.filename}）\n设计意图说明：${t.description}\n模板完整 JSON 原文：\n\`\`\`json\n${t.rawContent.trim()}\n\`\`\``;
      })
      .join('\n\n');
  }
}
