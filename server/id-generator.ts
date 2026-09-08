/**
 * server/id-generator.ts
 *
 * 全局唯一标识算法生成模块
 * 职责：通过高熵随机算法生成防碰撞、URL 友好的唯一标识符，彻底替代人为语义硬编码。
 */

import { customAlphabet } from 'nanoid';

// 问卷主键算法生成器 (以 sur_ 开头，10位高熵随机串)
const generateSurveyUid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);
export function generateSurveyId(): string {
  return `sur_${generateSurveyUid()}`;
}

// 访问短码算法生成器 (6位紧凑高熵字符，过滤 0/O/1/l/I 易混淆字符)
const generateShortUid = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 6);
export function generateShortCode(): string {
  return generateShortUid();
}

// 答卷记录全局主键算法生成器 (以 res_ 开头，12位高熵随机串)
const generateResponseUid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
export function generateResponseId(): string {
  return `res_${generateResponseUid()}`;
}
