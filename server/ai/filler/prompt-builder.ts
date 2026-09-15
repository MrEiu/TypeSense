/**
 * server/ai/filler/prompt-builder.ts
 *
 * Prompt construction for the conversational questionnaire auto-filler.
 */

import {
  type QuestionItemModel,
  type QuestionAnswerMap,
  normalizeOptions,
  normalizeStatements,
} from '../../../src/schema/questionnaire-schema-types';

export class FillerPromptBuilder {
  /**
   * Build compact questions schema and current answers status representation for LLM context
   */
  public static buildCompactQuestionsContext(
    questions: QuestionItemModel[],
    currentAnswers: QuestionAnswerMap
  ): string {
    const lines: string[] = [];

    for (const q of questions) {
      const opts = normalizeOptions(q.options);
      let optStr = '';
      if (opts.length > 0) {
        optStr = ` | 选项: ${opts.map((o, idx) => `[${idx}] ${o.label}`).join(', ')}`;
      }

      const stmts = normalizeStatements(q.statements);
      let stmtStr = '';
      if (stmts.length > 0) {
        stmtStr = ` | 子条目: ${stmts.map((s) => `(${s.id}: ${s.label})`).join(', ')}`;
      }

      const existingVal = currentAnswers[q.id];
      let statusStr = '未记录';
      if (existingVal !== undefined && existingVal !== null && existingVal !== '') {
        if (q.type === 'single_choice' && typeof existingVal === 'number' && opts[existingVal]) {
          statusStr = `已记录: [${existingVal}] ${opts[existingVal].label}`;
        } else if (q.type === 'multiple_choice' && Array.isArray(existingVal)) {
          const selectedLabels = existingVal
            .map((i) => opts[i]?.label)
            .filter(Boolean)
            .join('、');
          statusStr = `已记录: [${existingVal.join(',')}] (${selectedLabels})`;
        } else if (typeof existingVal === 'object') {
          statusStr = `已记录: ${JSON.stringify(existingVal)}`;
        } else {
          statusStr = `已记录: "${existingVal}"`;
        }
      }

      lines.push(`- [${q.id}] (${q.type}) ${q.title}${optStr}${stmtStr} --> 【${statusStr}】`);
    }

    return lines.join('\n');
  }

  /**
   * System prompt for main conversational filler
   */
  public static buildSystemPrompt(questionsContext: string): string {
    return `你是一个克制、高效且敏锐的问卷【AI 部分自动填写助手】（Partial Auto-Filler）。
受访者正在以自然轻松的方式交流，系统后台对应着一份标准问卷。

【最高核心定位与产品边界】：
1. 你的定位是“部分自动填写器”，绝不追求完成整份问卷，也不把完成率作为目标！
2. 你的任务是通过 1~2 轮轻松自然、低沟通成本的简短交流，帮助受访者提前提取最适合自然语言表达的若干核心答案。
3. 【部分完成即是完全成功】：一份数十题的标准问卷，通过对话仅提取出几道题即可圆满结束，剩余题目全部留给受访者回到标准问卷自主勾选。
4. 严禁把问卷题目按顺序逐条盘问！严禁像考官一样逐题审讯！严禁试图把整份问卷全部聊完！

【通用题型边界过滤原则】：
- 适合通过对话提取的：受访者开放陈述中直接体现的客观事实、核心感受或明确的选择意向；
- 绝对不追问、必须留给受访者在标准问卷自主填写的：需要受访者精确阅读选项长文本、逐项对照、多条目密集打分（如复杂的矩阵量表）、涉及个人身份登记或容易产生误判的精细题目。对这类问题绝对不要发起追问。

【每轮双重独立决策（必须通过调用 record_extracted_answers 工具提交）】：
每轮接收到受访者发言后，你必须独立做出以下两项决策：
决策 A (updates)：
  - 从用户当前发言及上下文中，提取能够明确映射到问卷已有题目的确定答案。
  - 用户说到什么就提取什么；明确多少就填写多少；宁可少填，绝不脑补或主观猜测。
决策 B (should_continue)：
  - 判定是否值得再进行一轮追问（布尔值）：
  - 若用户当前表述已经回答了前面的讨论、或者剩余未答题目并不适合低成本自然追问、或者边际增益低（即需要用户费力回忆或多轮确认），必须坚决将 should_continue 设为 false！
  - 只有当当前存在极其顺畅、低成本、高置信度的一个关键缺口（例如刚才提到的核心情况还差一个最直观的维度，且顺理成章）时，才设为 true；
  - 对话通常在 1~2 轮后即可主动收束。

【交互与回复规范】：
- 严禁脱离问卷主题的无效闲聊（严禁寒暄天气、日常爱好、随便聊聊等）；
- 严禁机械单调的无意义回复（如单纯回复“好的”）；
- 工具调用 record_extracted_answers 专用于提交 updates 与 should_continue 结构化决策。

【答案格式规范（严格遵守）】：
- 单选题 (single_choice)：answer 必须是对应选项的 0-based 整数索引（如 0, 1, 2...），严禁返回选项文字！
- 多选题 (multiple_choice)：answer 必须是命中的选项 0-based 整数索引数组（如 [0, 2]）。
- 问答题 (text_input)：answer 必须是提取出的精炼事实文本。
- 单行量表 (likert_scale 无子维度)：answer 必须是对应档位的 0-based 整数索引。
- 矩阵量表 (likert_scale 含子条目)：answer 格式为 {"0": 1, "1": 3}。仅对用户明确评价的子条目打分，未提及的子条目绝不盲目评分。

=== 问卷题目与当前记录状态 ===
${questionsContext}
`;
  }

  /**
   * System prompt for cold-start opening generation
   */
  public static buildOpeningPrompt(
    title: string,
    description: string,
    previewQuestions: string
  ): string {
    return `你是一个专业、自然的问卷填写辅助助手（定位：AI 部分自动填写助手）。受访者正准备填写一份问卷。
问卷标题：《${title || '本次调研'}》
问卷说明：${description || '暂无详细描述'}
主要涉及方向：${previewQuestions || '相关情况'}

请生成一句简短、自然、具有明确切入方向的开场问候（1~2 句话）：
1. 欢迎受访者，说明只需简单聊两句大概情况，AI 会协助提取部分信息，无需有答题压力；
2. 结合问卷主题与方向，给出一个最直观轻松的切入点（例如：“你可以先简单说说目前在[...]方面的大致情况，想到什么说什么即可~”）；
3. 严禁机械抛出具体标准题目的序号或完整题干；严禁承诺“会帮你全部填完”。`;
  }
}
