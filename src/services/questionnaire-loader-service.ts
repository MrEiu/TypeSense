/**
 * questionnaire-loader-service.ts
 *
 * 问卷数据加载与契约解析服务
 * 职责：从外部 JSON 数据源异步获取问卷数据，执行基本格式校验与合法性检查。
 */

import type { QuestionnaireModel, QuestionItemModel } from '../schema/questionnaire-schema-types';

export class QuestionnaireLoaderService {
  /**
   * 异步加载指定 URL 的问卷 JSON 并校验基本结构
   */
  public static async loadFromUrl(url: string): Promise<QuestionnaireModel> {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`加载问卷数据失败: HTTP ${response.status} ${response.statusText} (${url})`);
    }

    const rawData = await response.json();
    return this.validateAndNormalize(rawData);
  }

  /**
   * 校验与格式归一化
   */
  public static validateAndNormalize(raw: unknown): QuestionnaireModel {
    if (!raw || typeof raw !== 'object') {
      throw new Error('问卷 JSON 格式异常: 根节点必须为一个非空对象。');
    }

    const data = raw as Partial<QuestionnaireModel>;

    if (!data.id || typeof data.id !== 'string') {
      throw new Error('问卷 JSON 缺失必要字段: id (string)');
    }

    if (!data.title || typeof data.title !== 'string') {
      throw new Error('问卷 JSON 缺失必要字段: title (string)');
    }

    if (!Array.isArray(data.questions)) {
      throw new Error('问卷 JSON 缺失必要字段: questions (array)');
    }

    const validatedQuestions: QuestionItemModel[] = [];

    data.questions.forEach((q, index) => {
      if (!q || typeof q !== 'object') {
        throw new Error(`问卷第 ${index + 1} 项题目格式无效。`);
      }

      if (!q.id || typeof q.id !== 'string') {
        throw new Error(`问卷第 ${index + 1} 项题目缺失 id。`);
      }

      if (!q.type || !['single_choice', 'multiple_choice', 'text_input', 'likert_scale'].includes(q.type)) {
        throw new Error(`问卷题目 [${q.id}] 具有不受支持的题目类型: ${q.type}`);
      }

      if (!q.title || typeof q.title !== 'string') {
        throw new Error(`问卷题目 [${q.id}] 缺失 title 文本。`);
      }

      validatedQuestions.push({
        id: q.id,
        type: q.type,
        title: q.title,
        description: q.description,
        options: q.options,
        statements: q.statements,
        placeholder: q.placeholder,
        required: q.required,
        set: q.set && typeof q.set === 'object' ? (q.set as Record<string, string | number>) : undefined,
        jump: q.jump,
      });
    });

    return {
      id: data.id,
      slug: data.slug,
      title: data.title,
      description: data.description || '',
      questions: validatedQuestions,
    };
  }
}
